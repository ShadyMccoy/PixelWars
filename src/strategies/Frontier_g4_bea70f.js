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

// Hypothesis: combine the two validated wins on this lineage.
//   - parent walked def 30→40 and gained +23 (a third consecutive
//     def step paying off, against PressureSink-style attrition)
//   - sibling g3_ad3d81 (prod 50→40, stack 0→10) beat the parent by
//     fattening supply-chain pulses to the FRONT via Spearhead
// Parent already tunneled the def axis to 40 — pushing further to 50
// means atk=0, which probably starves the kill-or-stay branch even
// with the 1.4x ATTACKER_BONUS. Instead, hold parent's def-40 floor
// (still our best guard against PressureSink in the loss context)
// and pull 10 prod → stack to import the sibling's stack pump.
//
// Why we expect this to compose rather than cancel:
//  - def 40 protects FRONT tiles, stack 10 lets INTERIOR tiles deliver
//    bigger pulses through lowestDepthFriendlyNeighbor — these target
//    different mechanics (incoming damage vs outgoing pulse size).
//  - prod 50→40 is the same step the sibling already validated; we're
//    not paying a new cost, we're paying a known-acceptable one.
//  - In losses 1, 3, 4 the parent placed #2/#3 to other Frontier
//    variants in long games (561–653 ticks); fatter pulses should
//    compound there exactly when raw prod parity won't.
//  - If rating drops, we learn def 40 + stack 10 don't compose and
//    one of the two single-axis bets was load-bearing on its own.
export default {
  name: "Frontier_g4_bea70f",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Frontier_g3_eaf9b1 with 10 prod → stack: combine parent's def-40 floor with the sibling's validated stack pump.",
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
