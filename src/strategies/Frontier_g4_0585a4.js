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

// Hypothesis: the atk→def walk is accelerating, not flattening.
// Lineage gains: g1 +7, g2 +13, g3 +46. The slope is steepening, which
// strongly suggests we're still on the upslope and the optimum is
// further along. Take one more step of the same size: atk 10→0,
// def 40→50.
//
// Why atk:0 should be tolerable:
//  - tryKillAdjacent's kill math is gated by the fixed ATTACKER_BONUS
//    (1.4), not the atk tech knob — adjacent kill decisions don't
//    collapse just because atk is 0.
//  - Spearhead-driven front pushes lean on stack momentum and prod
//    feed, both of which are unchanged here.
//  - Against the parent's loss context (PressureSink, Frontier-clones
//    farming border attrition), def is the multiplier that directly
//    blunts that attrition — exactly the matchups we keep placing #2/#3
//    in.
//
// If rating drops, we know def 40 was the local optimum and the next
// descendant should walk back / try a different axis.
export default {
  name: "Frontier_g4_0585a4",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with another 10 atk → def: extend the accelerating def-axis walk one more step.",
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
