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

// Hypothesis: the def-axis walk keeps paying — each 10 atk → def step
// has improved (g1 -4 noise, g2 +14, g3 +44, accelerating). Take one
// more identical step: atk 10 → 0, def 40 → 50. This is the terminal
// rung on this axis (atk can't go below 0), so we either find a new
// peak or this run answers "where does the def slope finally flatten".
//
// Why atk=0 should not be a cliff:
//  - tryKillAdjacent multiplies by ATTACKER_BONUS=1.4 before the swap,
//    independent of atk tech. Marginal kills that survived at atk=10
//    mostly survive at atk=0 because the 1.4x inflator dominates.
//  - Spearhead's value comes from stack momentum and prod=50 throughput
//    (unchanged), not from raw atk multiplier.
//  - g3's loss vs PressureSink (#3, s365) and the 5/6 vs Sink-style
//    lineups suggest sustained border attrition is still the binding
//    constraint, and def directly blunts that.
// If rating drops, we know def 40 was the local optimum and the next
// descendant should walk back / explore prod or stack instead.
export default {
  name: "Frontier_g4_be2ba4",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with the final 10 atk → def: walk the def axis to its endpoint.",
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
