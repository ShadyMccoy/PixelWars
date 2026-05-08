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

// Hypothesis: the atk→def walk has saturated. Lineage Δs:
//   g0(50/0)→g1(30/20) +14, g1→g2(20/30) +41, g2→g3(10/40) 0.
// Parent's own rule was "climb = keep walking, flat/drop = stop." It
// went flat, so stop. Both move and stack are still frozen at 0 —
// genuinely unexplored axes per the prompt's signal note.
//
// One-knob change: shift 10 atk → 10 stack. Why stack and not move:
//   - lab1 has maxArmy 12 — stack ceiling is a hard cap that the
//     Spearhead branch hits constantly when funnelling armies into
//     a front tile. Small stack tech raises that ceiling, letting
//     the Spearhead momentum compound at the front.
//   - tryKillAdjacent already gets a 1.4x ATTACKER_BONUS, so atk 10→0
//     barely changes which adjacent kills land — most of those kills
//     succeed off the inflator, not the marginal atk multiplier.
//   - Move (garrison floor) doesn't really help the painter plan,
//     which already routes interior armies forward by depth; stack
//     touches the actual bottleneck (per-tile output) directly.
//
// Loss context: 3/5 recent losses were to other Frontier_* descendants,
// many of which are stack-fed Spearhead variants out-pushing the parent
// at the front. Funding stack should help mirror-match against the
// rest of the lineage, which is increasingly the relevant ladder.
//
// If rating climbs we keep walking stack; if it drops we know atk 10
// was load-bearing in a way the 1.4x bonus didn't fully cover.
export default {
  name: "Frontier_g4_e93d9a",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 0, def: 40 },
  description: "Frontier_g3_eaf9b1 with 10 atk → 10 stack: def axis saturated, open the unexplored stack axis to raise the maxArmy=12 ceiling.",
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
