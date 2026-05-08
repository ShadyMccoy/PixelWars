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

// Hypothesis: parent (g3_eaf9b1) walked def 30→40 and gained +37.
// Sibling g3_ad3d81 (which beat the parent) probed the frozen stack
// axis from a different baseline (10 prod → 10 stack at atk:20/def:30)
// and won. That's two independent positive signals: def 40 is good,
// and stack 10 is alive. Combine them: keep parent's atk:10/def:40
// and take the sibling's prod 50→40, stack 0→10 step.
//
// Why this should compound rather than cancel:
//  - def 40 already softens the PressureSink/Frontier border attrition
//    that dominates the loss context (s373 PressureSink #1, s369
//    Frontier_g3_69a9ba #1). That's working — don't unwind it.
//  - stack 10 fattens the supply-chain pulses the painter pumps from
//    INTERIOR → FRONT, so FRONT armies stay above the 0.5 power floor
//    longer between Spearhead crack-attempts. Long games (s379, s369
//    at 545/507 ticks) are exactly where bigger working stacks should
//    compound versus a thinner pump.
//  - prod is at the steep-diminishing end past 40; trading 10 prod for
//    10 stack is the cheap side of that curve.
// If rating climbs, both knobs were under-set and they stack. If it
// drops, prod 50 was load-bearing on top of def 40 and we walk back.
export default {
  name: "Frontier_g4_4accfa",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Frontier_g3_eaf9b1 + sibling's prod→stack swap: stack 10 atop def 40 to fatten supply pulses without unwinding defense.",
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
