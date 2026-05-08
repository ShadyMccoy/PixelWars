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

// Hypothesis: parent (g1) moved 20 atk → 20 def to survive
// PressureSink attrition, and netted ~noise (-2 rating). Same painter,
// same tactics — only tech changed. Two readings are possible:
//  (a) def is neutral/slightly bad; push further to confirm and stop.
//  (b) def is mildly good but 20 wasn't enough to swing the matchups
//      we still lose 4/5 to (PressureSink, vanilla Frontier).
// Step further along the same axis: take another 10 from atk → def.
// The 1.4x ATTACKER_BONUS already inflates kill-or-stay outcomes, so
// dropping atk from 30 → 20 should barely change which kills succeed,
// while def 20 → 30 measurably stiffens border tiles against the
// sustained pressure that PressureSink and Frontier both apply. If
// rating climbs we keep walking; if it drops we know the g1 bump was
// already past the def optimum.
export default {
  name: "Frontier_g2_34255e",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 20, def: 30 },
  description: "Frontier_g1 with another 10 atk → def: keep walking the def axis to find the optimum.",
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
