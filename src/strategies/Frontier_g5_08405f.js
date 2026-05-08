import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

const ATTACKER_BONUS = 1.4;

// Hypothesis: parent (atk 0 / def 50) collapsed -172 vs its own parent
// — the def-axis walk overshot hard. Parent's own comment said: "If
// rating drops, we know def 40 was the local optimum and the next
// descendant should walk back / try a different axis." The data is
// emphatic, so do exactly that.
//
// Step 1 — walk back to the proven g3 baseline: atk 10, def 40. The
// loss context confirms why:
//   - 4 of 5 losses had attackers (Frontier_g4_a450d6, g4_490175,
//     g4_c9d674) at non-zero atk; our atk=0 left tryKillAdjacent
//     leaning entirely on the 1.4x bonus and getting outtraded.
//   - g4_a450d6 (the parent's #1 loss in s87) sits at def 40 plus
//     stack 10 and won — strong evidence def 40 is the real knee.
//
// Step 2 — explore an axis the entire lineage has frozen at zero:
// move. Every g0..g4 row is move=0; the sibling winner a450d6 already
// proved stack=10 from prod, so stack is now a known-good but no
// longer novel direction. Pull the freed 10 from prod (siblings 490175
// and a450d6 both won at prod 40, so prod 50→40 is survivable) and
// put it into move. Resulting tech: { move:10, stack:0, prod:40,
// atk:10, def:40 }.
//
// Why move should help in this build:
//   - Per techs.md, move acts as a garrison floor — interior tiles
//     hold a minimum stack instead of bleeding to zero. Our painter
//     splits FRONT (Spearhead) vs INTERIOR (depth-walk pump). The
//     INTERIOR path leaks tiles to passing raiders when it's empty
//     mid-walk; a non-zero garrison floor plugs that leak directly.
//   - The recurring loss pattern is mid-game flips, not late-game
//     attrition (def 40 already handled attrition); a garrison floor
//     specifically counters the flip-an-empty-interior failure mode.
//
// If rating drops, move=10 was wasted on this map's wrap topology
// and the next descendant should put that 10 into stack like a450d6
// did. If it climbs, move is a real unexplored lever and we keep
// walking it.
export default {
  name: "Frontier_g5_08405f",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 40, atk: 10, def: 40 },
  description: "Walk back to g3 baseline (atk 10 / def 40) and probe the frozen move axis: 10 prod → move to plug interior garrison leaks.",
  act(army, game) {
    if (tryKillAdjacent(army, ATTACKER_BONUS)) return;

    const tile = army.tile;
    if (!tile) return;
    const map = game.map;
    const idx = tile.pos.y * map.width + tile.pos.x;
    const plan = paintFrontier(game, army.player);
    const role = plan.roles[idx];

    if (role === ROLE_FRONT) {
      Spearhead.act(army, game);
      return;
    }
    if (role === ROLE_INTERIOR) {
      const next = lowestDepthFriendlyNeighbor(army, plan);
      if (next) {
        const power = army.attackPower;
        if (power > 0.5) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
