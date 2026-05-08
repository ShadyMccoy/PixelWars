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

// Hypothesis: parent (g5, 50/10/40) recovered the rating with a snap-back to
// g3's tech (+264 vs the prod-cut g4). The parent's own conclusion was: prod
// is non-negotiable, so the next probe should fund a different axis from
// stack or atk — never prod. Siblings that beat the parent already explored
// atk:10 → def:50 (two deep on the validator), so this slot belongs to the
// unexplored axis: `stack`.
//
// One-knob change: shift atk 10 → stack 10. Tech becomes 0/10/50/0/40.
//  - prod stays at 50 (the load-bearing knob from the g4→g5 swing).
//  - def stays at 40 (sibling work already covers the def:50 ceiling).
//  - atk 10 → 0 mirrors what siblings showed was nearly free: ATTACKER_BONUS
//    1.4 dominates kill arithmetic on tryKillAdjacent, and Spearhead leans
//    on stacking momentum more than raw atk.
//  - stack 0 → 10 is a fresh axis. On lab1 (30x22 wrap, growth 1.8,
//    maxArmy 12) the front role funnels armies through Spearhead chains;
//    a stack multiplier should let interior-fed columns hit the front with
//    larger consolidated bodies, increasing the chance tryKillAdjacent and
//    the lowest-depth march actually pop a defender instead of bouncing.
//
// Read of result:
//  - Rating climbs vs g5 → stack is the next axis to walk; queue another
//    10 from atk-or-def into stack.
//  - Rating flat / drops → stack at 10 doesn't earn its keep on this map's
//    short supply lines, and future descendants should look at move (the
//    other frozen column) or revisit the def:50 sibling baseline instead.
export default {
  name: "Frontier_g6_8f4b09",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 0, def: 40 },
  description: "Frontier_g5_ce16cd with 10 atk -> stack: probe the unexplored stack axis while keeping prod:50/def:40.",
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
