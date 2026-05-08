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

// Hypothesis: def axis has paid two steps in a row (g2 +15, g3 +46) so
// keep walking it, but stop pulling from atk. Parent already sits at
// atk:10; another 10 off would zero out atk tech and likely cripple
// tryKillAdjacent / Spearhead swap math against atk-heavy bots
// (Frontier_g2_461435 at 50/10, Conqueror lineups). Sibling
// Frontier_g3_bd5683 already validated that "shift prod -> def, keep
// atk" was a net winner against this same parent line, so apply that
// move one step further from g3's allocation: prod 50 -> 40, def
// 40 -> 50, atk stays 10.
//
// Why expect this to help vs the s167 loss context:
//  - PressureSink (#4 finish, won) farms border attrition; def:50
//    blunts that more than the equivalent prod tick would compound,
//    since prod's marginal slope is shallowest in the high-prod range.
//  - Frontier_g5_794766 and Frontier_g3_8c5891 (both winners) win on
//    swap-math during Spearhead pushes; def is exactly the multiplier
//    that flips marginal swaps in our favor when defending.
//  - Keeping atk:10 preserves the 1.4x attacker bonus on the front
//    role's tryKillAdjacent path, which the lineage has not had to
//    discount yet.
// If the rating drops, def 40 was the local optimum and the next
// descendant should walk back / try the stack or move axes.
export default {
  name: "Frontier_g4_f847e1",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 10, def: 50 },
  description: "Frontier_g3 with 10 prod -> def (40/10/50): keep climbing def, preserve atk floor for kill bonus.",
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
