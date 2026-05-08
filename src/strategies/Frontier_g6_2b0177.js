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

// Tech inherited verbatim from parent (50/10/40). One-knob LOGIC
// change: lower the INTERIOR pump floor from power > 0.5 to
// power > 0.25.
//
// Hypothesis: parent's recent losses are all long #2/#3 finishes
// against other Frontier variants (572, 626, 394, 542, 472 ticks).
// In long games the front role (Spearhead) is reinforcement-bound:
// it cracks the border in proportion to the supply pulses arriving
// from interior tiles. The 0.5 floor strands every interior tick
// where attackPower lands in (0.25, 0.5] — those sub-threshold
// contributions just sit and regen-cap instead of flowing toward
// the front. With prod:50 + growth:1.8 + maxArmy:12 the per-tile
// regen is fast enough that releasing smaller pulses won't starve
// the interior; the saved wallclock is what matters because
// maxArmy:12 caps how much a held interior tile can usefully
// stockpile anyway. Net effect: a more continuous supply stream
// to the front, which should tip close Frontier-vs-Frontier games
// where the parent currently lands #2.
//
// Why not change ATTACKER_BONUS instead: tryKillAdjacent is the
// kill heuristic and its threshold tunes safety margin; that's
// orthogonal to the supply-chain bottleneck the loss pattern
// suggests. Touching one axis at a time gives a cleaner read.
//
// If rating climbs, the supply-chain throttle was load-bearing
// and a future descendant can probe the threshold further or
// extend the same idea (e.g. pulse fraction). If it drops, the
// 0.5 floor was protecting interior reserves and we know to
// leave it alone.
const INTERIOR_PUMP_FLOOR = 0.25;

export default {
  name: "Frontier_g6_2b0177",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g5_ce16cd with INTERIOR pump floor 0.5 -> 0.25: more continuous supply to Spearhead in long games.",
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
        if (power > INTERIOR_PUMP_FLOOR) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
