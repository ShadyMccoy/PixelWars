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
const INTERIOR_PUMP_FLOOR = 1.0;

// Hypothesis: parent (g6, 45/3/52) dropped -36 vs g5 (50/3/47), which
// matches its own "if rating drops" branch — prod=50 was load-bearing
// and def:47 was at/near the local optimum. The roadmap explicitly
// said: "Next descendant should freeze tech and probe behavior instead
// (e.g. raise the 0.5 power floor on INTERIOR delegation, or tighten
// the role split)."
//
// Tech locked at parent's 45/3/52 (per spawn rules). Probing the cheap
// behavior knob: raise INTERIOR's pump floor from 0.5 → 1.0. With
// prod=45 (already 5 below g5) interior tiles accumulate noticeably
// slower, so dribbling at every >0.5 wastes the micro-charge on a
// transfer instead of letting it batch into a single chunkier push.
// Bigger packets reaching the front matter more given atk pinned at 3
// — Spearhead's stencil push converts strength into actual kills, and
// fewer-but-fatter handoffs amortize Spearhead's setup over more force
// per delivery. This is a single-line change against parent's losses
// to atk-heavy Frontier variants (50/30/20, 40/20/40, 50/50/0): we
// can't outslug them, so we want each interior-to-front transfer to
// land as a usable mass rather than a trickle the enemy can absorb.
//
//  - If rating climbs: the 0.5 floor was over-eager dribble; chunkier
//    pumps win the front. Future descendants can sweep this floor
//    upward (1.5, 2.0) to find where it tips.
//  - If rating drops: the front is power-starved, not packet-starved
//    — the bottleneck is total throughput, not chunk size. Next
//    descendant should drop the floor below 0.5 or revisit role split.
export default {
  name: "Frontier_g7_71a0e4",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 45, atk: 3, def: 52 },
  description: "Frontier_g6 with INTERIOR pump floor 0.5 → 1.0: chunkier handoffs to the front given slow prod=45.",
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
