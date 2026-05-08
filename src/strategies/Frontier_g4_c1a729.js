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

// Hypothesis: lineage trajectory is monotonic on the def axis with
// diminishing but positive deltas (+33, +24, +14). Parent's stated
// rule was "keep walking until rating drops, same step size (10)."
// Take the next step: atk 10→0, def 40→50.
//
// Why I expect this to still be net positive:
//  - Diminishing returns suggest we're near the optimum but haven't
//    yet crossed it. The +14 at g3 was still clearly positive.
//  - Losses #2/#3 in the parent's recent set (PressureSink, Frontier_g2)
//    are exactly the matchups where def stacking pays — both win by
//    sustained border attrition that a higher def multiplier blunts.
//  - tryKillAdjacent's kill check uses ATTACKER_BONUS=1.4 which is
//    independent of atk tech; the atk multiplier mainly scales
//    attack OUTPUT (how much strength is spent/transferred), not
//    whether kills succeed. Spearhead's pushes lean on stack/momentum
//    via attackPower more than on raw atk multiplier.
//  - Step size matches the parent's convention so if rating drops we
//    know g3 (10/40) was the local optimum and we walk back next gen.
export default {
  name: "Frontier_g4_c1a729",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with one more 10 atk → def step (atk 0, def 50): keep walking the def axis until the rating turns over.",
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
