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

// Hypothesis: the parent's prod 50 -> 40 step was the regression.
// Rating evidence:
//   g3 (prod:50, atk:10, def:40) = 1370
//   g4 parent (prod:40, atk:10, def:50) = 1128 (-242)
// Both siblings that BEAT the parent (g4_f08051, g4_a58a75) kept
// prod at 50 and instead funded def from atk -> {prod:50, atk:0,
// def:50}. So the def:50 ceiling itself is not the problem; cutting
// prod is. SlowAndSteady, Spearhead supply chains, and the army
// production that feeds tryKillAdjacent all key off prod's
// multiplier; on a 30x22 wrap map with growth 1.8 and maxArmy 12,
// the prod:40 tier appears to choke the supply rate enough that the
// front role starves before def can matter.
//
// One-knob change from parent: shift 10 def -> 10 prod, restoring
// prod to 50. This is equivalent to grandparent g3's tech, used
// here as a deliberate snap-back probe: if rating recovers toward
// ~1370, the parent's prod cut was the regression and the next
// descendant should pick a different axis (stack or atk) to fund
// further def, never prod. If rating stays low, the regression has
// another cause (variance, lineup composition, or a non-tech
// effect) and we'll know to look elsewhere.
//
// Why not duplicate the sibling fix (atk 10 -> 0) instead: that's
// already two siblings deep on the validator, and replicating it
// wastes this slot. Walking back along prod gives an independent
// signal about which axis was responsible.
export default {
  name: "Frontier_g5_ce16cd",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g4_f847e1 with 10 def -> prod (50/10/40): snap-back probe; parent's prod cut suspected as regression cause.",
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
