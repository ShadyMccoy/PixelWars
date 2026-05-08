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

// Hypothesis: lineage def-axis trajectory is g0(0)->g1(20)->g2(30)->
// g3(40), gaining +21,+17,+26. The slope has not flattened — the last
// step gave the biggest jump. Parent's stated rule was "if rating
// climbs we keep walking; matching the previous step size (10)".
// Rating climbed +26, so walk one more 10-step on the same axis:
// atk 10 -> 0, def 40 -> 50. This is the terminal step on the atk
// axis; if rating drops, we know def 40 was the optimum and the next
// descendant walks back.
//
// Why atk:0 should not collapse offense:
//  - tryKillAdjacent uses ATTACKER_BONUS=1.4 (a stack inflator), not
//    the atk tech multiplier, so kill thresholds barely move.
//  - Spearhead pushes lean on stack momentum + prod=50 production,
//    not raw atk slope.
//  - Against PressureSink (#2 and #3 losses farmed us by sustained
//    border attrition) and Frontier_g2_461435 (won s173 game 1) the
//    binding constraint was defender swap math, exactly what def
//    softens. Moving the last 10 onto def maximizes that survival
//    multiplier.
export default {
  name: "Frontier_g4_96bf79",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with one more 10-step atk -> def: terminal step on the atk axis after the +26 jump.",
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
