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

// Hypothesis: parent (g3) holds atk 10 / def 40 (rating 1448, +26 over g2).
// Two sibling branches off g2 *also* won by leaving atk/def at 20/30 and
// instead pulling 10 prod → stack (g3_69a9ba and g3_ad3d81 both beat the
// parent). That's two independent bots converging on the same untested
// axis: stack feeds Spearhead bursts on the FRONT and fattens the supply
// pulses INTERIOR tiles deliver outward. Parent never tested it.
//
// Step: keep the def-heavy posture intact (atk 10 / def 40 unchanged) and
// pull 10 from prod → stack. Why this should compound rather than cancel:
//  - Parent's recent losses are mostly close #2 finishes to other Frontier
//    variants (459–724 ticks). In long Frontier-vs-Frontier games the
//    front rarely cracks on raw atk; it cracks when one side delivers a
//    bigger pulse than the other can absorb. Stack is exactly that lever.
//  - prod 50 → 40 is the same downshift the winning siblings took, so we
//    have evidence the SlowAndSteady interior pump still works at 40.
//  - def 40 is preserved, so the attrition resistance that gave us +26
//    over g2 is unchanged — we're stacking a validated lever on top of a
//    validated posture, not trading one for the other.
// If rating climbs, stack stacks (sic) on top of def. If it drops, prod
// 50 was load-bearing for *this* def-heavy build specifically.
export default {
  name: "Frontier_g4_7eb24f",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Frontier_g3 with 10 prod → stack: layer the sibling-validated stack lever on top of the def-heavy posture.",
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
