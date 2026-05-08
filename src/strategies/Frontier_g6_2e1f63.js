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
const INTERIOR_PUMP_MIN = 1.0;

// Hypothesis: raise the interior-pump gate from 0.5 → 1.0 so interior
// tiles wait for fatter pulses before relaying. Same tech as parent
// (atk 3 / def 47 / prod 50) — only the per-army logic moves.
//
// Why this matters here:
//  - Sibling Frontier_g3_ad3d81 (which beat the parent) won by adding
//    stack:10 to "fatten supply-chain pulses" reaching the front.
//    Tech is locked, so we can't fatten pulses via stack — but we can
//    fatten them via the relay threshold: a tile that holds at 0.7
//    instead of pumping at 0.5 delivers a 1.4x bigger pulse one tick
//    later. That's the threshold-side analog of the +stack move.
//  - Parent's losses are all long games (seed=264 ticks=868, seed=289
//    ticks=611, seed=300 ticks=593) where it gets out-pushed by other
//    Frontier variants. Long games are exactly where compounding pulse
//    size matters: more strength arrives per pump, fewer pumps are
//    eaten by passive border erosion, and FRONT armies cross the kill
//    threshold against high-def neighbors instead of bouncing.
//  - Atk:3 is the thinnest attacker in the lineage that doesn't crash;
//    every kill needs the 1.4x bonus to land. Bigger pulses reaching
//    FRONT means Spearhead has more headroom to actually clear kills
//    rather than nibble.
//
// Falsification: if rating drops, interior tiles were already
// pulse-saturated and the gate was just a no-op floor — future
// descendants should leave it at 0.5 and attack a different axis (e.g.
// the FRONT-vs-INTERIOR boundary rule, or the kill-margin estimator).
export default {
  name: "Frontier_g6_2e1f63",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 3, def: 47 },
  description: "Frontier_g5_8000dc with interior-pump threshold 0.5 → 1.0: hold for fatter pulses, threshold-side analog of the +stack pulse-fattening move.",
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
        if (power > INTERIOR_PUMP_MIN) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
