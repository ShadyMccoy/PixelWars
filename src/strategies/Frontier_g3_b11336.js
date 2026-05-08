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
const INTERIOR_PUMP_THRESHOLD = 0.25;

// Hypothesis: tech is locked at parent's prod:50/atk:20/def:30, so the
// only place to look for gains is logic. The interior pump path gates
// on `power > 0.5` before forwarding to lowestDepthFriendlyNeighbor.
// With atk:20 / def:30 / prod:50 / maxArmy:12, interior tiles that
// haven't fully ticked up are getting their power stranded one tick
// per gate-fail, then SlowAndSteady picks something less useful.
//
// Drop the interior threshold from 0.5 → 0.25. Why this should help:
//  - Parent lost 3/5 recent matches to other Frontier descendants
//    (g1_ed1ff5 twice, g3_61b131, g5_d0eeb0). All share the painter
//    role logic, so the differentiator is throughput to the front.
//  - With prod:50 the interior pump fires often, but at low maxArmy
//    each tile's attackPower spends a lot of time in the [0.25, 0.5]
//    band where the parent stalls and we don't.
//  - Pushing forward at 0.25 sends weight to the FRONT one tick
//    earlier, which compounds across the painter's depth chain —
//    Spearhead at the front gets fed more consistently against
//    sustained-pressure opponents (PressureSink / Frontier mirrors).
//  - Risk: shipping fractional power leaves interior tiles thinner
//    when an enemy breaks through. But our def:30 border buys time,
//    so the interior rarely has to absorb a raw breach.
//
// If the rating climbs we know interior throughput was the bottleneck
// and 0.25 is a usable floor. If it drops, the 0.5 gate was load-
// bearing and we should walk back toward 0.5 (or above) next gen.
export default {
  name: "Frontier_g3_b11336",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 20, def: 30 },
  description: "Frontier_g2 with interior pump threshold 0.5 → 0.25: ship interior power to the front a tick earlier.",
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
