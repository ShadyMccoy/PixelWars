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

// Hypothesis: the atk → def walk is accelerating, not plateauing.
// Lineage Δs:  g1 +0,  g2 +16,  g3 +41.  Parent's own rule was
// "if rating climbs we keep walking; if it drops we stop." +41 is
// the biggest jump yet, so take one more step of the same size 10:
//   atk 10 → 0, def 40 → 50.
//
// Why this should still help against the loss context:
//  - PressureSink (s155 #2 finish) wins by sustained border attrition.
//    def:50 maxes the multiplier that blunts that — exactly the axis
//    its sink tiles attack. If def were already over-invested we'd
//    have seen a drop at g3, not the biggest jump in the lineage.
//  - Frontier-family losers (s166 to vanilla Frontier and g3_8c5891)
//    win on Spearhead swap math when *we* are defending. Maxing def
//    softens those exchanges further.
//  - Offensive output is gated by the 1.4x ATTACKER_BONUS in
//    tryKillAdjacent and by Spearhead's stack momentum, not raw atk
//    tech. Dropping atk 10 → 0 is the boundary case for this axis;
//    if rating drops, we know atk:10 was the local optimum and walk
//    back. If it climbs, the def axis still has slack and the next
//    step has to come from the frozen prod/stack/move columns.
export default {
  name: "Frontier_g4_a4f587",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with one more 10 atk → def step: atk 0 / def 50, walking the def axis to its boundary after the +41 jump.",
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
