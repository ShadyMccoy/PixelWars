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
const INTERIOR_PUMP_THRESHOLD = 1.5;

// Hypothesis: tech is locked at parent's (0/0/50/3/47). Change ONE
// thing in act(): raise the interior-pump power threshold from 0.5 to
// 1.5. Why this should help against the loss profile in season #264:
//
//  - 4 of 5 recent losses were close #2 finishes, several to other
//    Frontier variants (g1_ed1ff5, Frontier, g3_69a9ba). In painter
//    mirror matches, the front role delegates to Spearhead, which is
//    a burst attacker — bigger incoming pulses translate fairly
//    directly into bigger crashes.
//  - With prod 50 (best in slot) interior tiles refill quickly, so
//    each interior army at threshold 0.5 relays nearly every tick: a
//    drip of small packets that arrive smeared in time and never
//    align with a Spearhead burst window. Threshold 1.5 makes each
//    tile wait ~3x longer and relay ~3x bigger packets, so successive
//    interior tiles fire in coarser, more coherent waves.
//  - Defense is unchanged at 47, so attrition tolerance against
//    PressureSink-style opponents is preserved while we wait.
//  - With atk only 3, the front DOES need every bit of mass it can
//    get behind it; a coherent pulse helps Spearhead break parity.
//
// If rating climbs: pulse coherence beats drip-feed at this tech mix
// — try threshold 2.0 next. If it drops: drip-feed was actually
// load-bearing (latency to the front matters more than pulse size at
// this map/growth) and we should walk a different logic axis.
export default {
  name: "Frontier_g6_6a4e0f",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 3, def: 47 },
  description: "Frontier_g5_8000dc with interior-pump threshold 0.5→1.5: relay coarser, more coherent pulses to feed Spearhead bursts in close mirror matches.",
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
        if (power > INTERIOR_PUMP_THRESHOLD) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
