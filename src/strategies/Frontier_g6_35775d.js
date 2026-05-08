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
const INTERIOR_PUMP_FLOOR = 0.25;

// Hypothesis: tech is locked at the lineage's best allocation
// (50/10/40, matching the g3 plateau and the g5 snap-back peak).
// Logic gains have to come from elsewhere. The parent's interior
// pump only forwards power when attackPower > 0.5; below that the
// army idles. In the season #252 losses, four of five were long
// sustained games (ticks 398, 447, 426, 796) against rival
// Frontiers running the same painter, so the matchups are decided
// by the steadiness of the supply chain, not the size of any one
// pulse. With prod 50 and growth 1.8 on a 30x22 wrap, interior
// tiles spend a non-trivial fraction of ticks sitting in the
// 0.25-0.5 power band; those ticks are dead weight today.
//
// One-knob change: drop the interior pump floor from 0.5 to 0.25.
// Smaller, more frequent forwards keep depth shallowest at the
// FRONT, which is exactly what lowestDepthFriendlyNeighbor is
// trying to maintain. Risks: tinier attacks can stall on a single
// border tile, and we trade some pulse magnitude for cadence —
// but Spearhead at the front already prefers a steady trickle
// over hoarding, so cadence should win in the long-tick games
// that the parent has been losing. If the rating drops, we'll
// know the 0.5 cutoff was load-bearing as a consolidation valve.
export default {
  name: "Frontier_g6_35775d",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g5_ce16cd with interior pump floor 0.5 -> 0.25: smoother supply chain in long games against mirror Frontiers.",
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
