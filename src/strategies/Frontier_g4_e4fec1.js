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

// Hypothesis: the def-axis walk is still accelerating, not flattening.
// Lineage gains along this axis: g0→g1 +17, g1→g2 +18, g2→g3 +31.
// Each 10-point shift atk→def has gotten *more* productive, not less,
// so the local optimum is plausibly past def:40. Take the same step
// once more: atk 10→0, def 40→50.
//
// Why this should still work:
//  - tryKillAdjacent applies the 1.4x ATTACKER_BONUS as the inflator
//    on the kill check; the atk tech multiplier compounds with it.
//    Going atk:30→20→10 didn't visibly cost us kills (rating climbed),
//    so atk:10→0 should mostly just lose marginal kill chances on
//    tiles that were already borderline — and def:50 should make
//    those same borderline trades favor us when we're the defender.
//  - Loss context still includes a 4th-place to PressureSink (s393)
//    and getting out-pushed by Frontier_g4_e7abc2 / Frontier_g2_461435
//    in long games. Both modes punish thin borders; def:50 is the
//    biggest single-tile durability we can buy.
//  - This is an information-bearing step: if rating drops we've
//    finally found the corner of the def axis (def:40 was optimal);
//    if it climbs we've validated the slope continues and future
//    descendants should explore the other frozen axes (stack, move).
export default {
  name: "Frontier_g4_e4fec1",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with another 10 atk → def (atk:0/def:50): push the accelerating def-axis walk to its corner.",
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
