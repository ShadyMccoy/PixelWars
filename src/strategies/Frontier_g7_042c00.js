import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent's g5→g6 step (ATTACKER_BONUS 1.4→1.5) addressed
// the kill-conversion side of mirror matches. The remaining
// "alive but not closing" pattern in parent's losses (4-of-5 #2/#3
// finishes, ticks 497-768) suggests supply cadence is the next
// bottleneck — front tiles take a kill via the now-juicier 1.5x
// bonus, then sit at low strength waiting for the interior to refill
// them. Parent's own comment explicitly nominated the interior
// power>0.5 threshold as the next axis to explore.
//
// One-knob change: lower interior pump threshold 0.5 → 0.4. Interior
// armies forward strength one step earlier, tightening resupply
// cadence to the front. With maxArmy=12 and growth=1.8, interior
// tiles cap quickly anyway, so the marginal cost of pumping a
// slightly smaller stack is small relative to the gain in cadence.
//
// Why not 0.3: too aggressive risks dribbling 1-2 strength forward
// that gets absorbed below tryKillAdjacent's threshold and helps no
// one. 0.4 is the minimum-discriminating step (matches the lineage's
// 0.1 walks on the ATTACKER_BONUS axis to stay revertable).
//
// Tech is locked vs parent (lineage tech-search has flattened).
const ATTACKER_BONUS = 1.5;
const INTERIOR_PUMP_MIN = 0.4;

export default {
  name: "Frontier_g7_042c00",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g6_f29ac0 with interior pump threshold 0.5→0.4: tighter supply cadence in long mirrors.",
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
