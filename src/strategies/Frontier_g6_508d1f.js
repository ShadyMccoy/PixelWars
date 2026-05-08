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

// Tech locked to parent (stack:10 / prod:50 / def:40 / atk:0).
//
// Hypothesis: parent's tech-only mutations have flattened (g3 1265 →
// g4 1219 → g5 1211). The next move has to be a logic tweak. The
// cheapest, most coherent logic change given parent's tech is to
// retune the INTERIOR forwarding threshold, currently a hardcoded
// 0.5 power floor.
//
// Why raise it (0.5 → 0.75): the lineage just bought stack:10. The
// whole point of stack tech is letting interior tiles accumulate
// fatter pulses before they relay to the front. But the painter's
// "if power > 0.5 attack" floor is from the era when stack was 0 —
// it forwards almost any tickle, which means stack:10's extra cap is
// being wasted (we relay a 0.6 pulse the same as a 1.5 one, never
// letting the wave consolidate). Raising the gate to 0.75 means
// interior armies hold one more tick on average before pushing,
// which lets prod:50's per-tick generation actually stack up to use
// the headroom we paid for in tech.
//
// Why this should help vs the loss context:
//  - Lost to Frontier_g3_bd5683 (prod:40/atk:20/def:40, no stack):
//    that bot's interior relay can't accumulate; if we forward in
//    bigger pulses our front waves arrive heavier than its.
//  - Lost to Frontier_g3_ad3d81 (prod:40/stack:10): same threshold,
//    lower prod. Fatter pulses + higher prod should beat their
//    fatter pulses + lower prod given a long enough game.
//  - Lost to Frontier_g1_0c6381 (atk:30, no stack/no prod-50): those
//    losses are tactical-not-economic, but a heavier front wave
//    helps survive their atk-driven counterpunches too.
//
// Risk: at low army counts early-game, holding pulses could let the
// front starve. Floor stays well below stack:10's cap so it should
// just delay one tick, not stall.
//
// If rating climbs: the relay-threshold axis is alive and worth more
// tuning (try 1.0 next). If it drops: 0.5 was load-bearing and the
// problem is upstream (front behavior or role assignment).
const INTERIOR_POWER_FLOOR = 0.75;

export default {
  name: "Frontier_g6_508d1f",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 0, def: 40 },
  description: "Inherit g5 tech; raise INTERIOR relay floor 0.5 → 0.75 so stack:10 actually accumulates between forwards.",
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
        if (power > INTERIOR_POWER_FLOOR) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
