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

// Hypothesis: the def axis is a clean monotonic climb at fixed +10
// step — g0→g1 +19, g1→g2 +25, g2→g3 +23. Same hypothesis-driven
// step the parent used: take 10 atk → def again. Final 10 of atk
// goes to def: atk 10→0, def 40→50.
//
// Why atk→0 should still be fine:
//  - tryKillAdjacent uses ATTACKER_BONUS=1.4 as the inflator on the
//    kill check; the atk tech is a small per-tick multiplier on top
//    of base attack output, not the gate that decides whether kills
//    land. The 1.4x has been carrying the offensive math the whole
//    lineage; the atk tech contribution at 10 was already marginal.
//  - The losses in s178 are mostly to other Frontier variants and
//    PressureSink — both win by sustained border attrition, exactly
//    what stacking def into 50 should blunt hardest. The 5/6 finishes
//    above #4 suggest survival, not kill-rate, is the bottleneck.
//  - Same step size (10) so we get a clean read: rating up → def
//    still alive at 50, rating down → def 40 was the local optimum
//    and this is the wall. Either outcome is high-information given
//    that stack/move are still wholly unexplored from this branch.
export default {
  name: "Frontier_g4_374617",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with the last 10 atk → def: walk the def axis to its terminus and probe for the wall.",
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
