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

// Hypothesis: the def axis has paid every single step in this lineage,
// and the gradient is *accelerating* (g0→g1 +14, g1→g2 +21, g2→g3 +30).
// The trend hasn't rolled over yet, so take the final step on the same
// axis with the same step size: atk 10→0, def 40→50.
//
// Why I expect this to still climb (or, if it doesn't, give a clean
// signal):
//  - tryKillAdjacent's kill check uses the 1.4x ATTACKER_BONUS, which
//    is independent of the atk tech multiplier; most kills the parent
//    wins at atk:10 should still resolve at atk:0 because ATTACKER_BONUS
//    is doing the heavy lifting on the kill threshold.
//  - The interior pump (lowestDepthFriendlyNeighbor → friendly attack)
//    routes strength inside our own territory, where def matters and
//    atk does not.
//  - 4/5 recent losses were to bots with stronger borders or to
//    PressureSink-style attrition farmers; def:50 maximizes our
//    resistance to incoming border damage.
//  - This is the terminus of the walk — if the rating finally drops
//    here, we know def 40 was the local optimum and the next descendant
//    should walk back or pivot to a different axis (prod/stack are
//    completely unexplored). If it climbs again, the gradient is even
//    steeper than we thought and the lineage's whole thesis (atk is
//    overweighted) is confirmed.
export default {
  name: "Frontier_g4_109513",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with the final step atk 10→0, def 40→50: terminal walk on the def axis after three accelerating wins.",
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
