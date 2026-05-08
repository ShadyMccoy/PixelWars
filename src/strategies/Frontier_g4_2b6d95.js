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

// Hypothesis: parent walked the def axis to 40 (+25 vs g2). Sibling
// g3_ad3d81 independently showed that taking 10 from prod → stack
// also beats the g2 baseline (its rating clears the parent's). Both
// vectors are "alive" but they were tested separately. Compound them:
// keep the parent's atk 10 / def 40 (the def axis is still climbing
// monotonically across g0→g3, so don't reverse it), and additionally
// take 10 from prod → stack like the sibling.
//
// Why this should be net positive:
//  - The painter's whole thesis is the supply chain: INTERIOR pumps
//    strength into FRONT, and FRONT delegates to Spearhead. A higher
//    stack ceiling lets the supply chain deliver fatter pulses,
//    which is exactly what the def-heavy borders need to convert
//    survival into pressure.
//  - prod=40 still drives the chain (sibling proved this is enough);
//    prod's slope is steepest near 0 and shallow at 50, so trading
//    the last 10 prod for 10 stack is a positive expected swap.
//  - We're not touching atk or def, so we don't disturb the only
//    axis we have strong monotone evidence for.
//
// If rating climbs, the two vectors compose. If it drops, we know
// stack and high def fight each other (e.g., bigger stacks need more
// prod to fill, and def-heavy play already starves prod).
export default {
  name: "Frontier_g4_2b6d95",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Frontier_g3_eaf9b1 + 10 prod → stack: stack the def-axis win with the sibling's stack-axis win.",
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
