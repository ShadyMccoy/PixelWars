import Conqueror from "./Conqueror.js";
import { sumStrength } from "../core/Army.js";

// Conqueror_g2_e0f65e + alignment-weighted cheap-kill selection.
//
// Parent's cheap-kill scan picks the *cheapest* free flank kill, regardless
// of direction. That's correct in isolation but ignores the bigger picture:
// the alignment system compounds three-in-a-row pushes across many ticks,
// so a flank detour can cost more long-term than the ~1 strength a cheap
// kill saves. When the parent has multiple cheap-kill candidates, we'd
// rather take the one that *extends* an existing column than one that
// isolates us off-axis.
//
// Score each cheap-kill candidate by friendly-mass support adjacent to the
// target (excluding our own source tile). Kills that lead into territory
// our column already partially controls score high; isolated flank kills
// score low. Cost still subtracts from the score, so among equally
// supported targets the cheaper one wins (parent behavior).
//
// When only one cheap kill exists, the choice is the same as the parent.
// When no cheap kill exists, behavior is byte-identical (falls through to
// Conqueror.act, preserving the dominant-in-season-29 alignment logic).
const BONUS = 1.4;
const CHEAP_KILL_RATIO = 0.4;
const SUPPORT_WEIGHT = 0.8;

export default {
  ...Conqueror,
  name: "Conqueror_g3_d31112",
  description: "Conqueror_g2_e0f65e + alignment-weighted cheap-kill picking.",
  summary: `Same tech (90/0/2/4/4) and core kernel as the parent. Refines
parent's cheap-kill opportunism: rather than always grabbing the cheapest
adjacent kill, score candidates by friendly-mass support around the target
(sumStrength over the target's other neighbors) minus cost. Cheap kills
that extend the marching column win; isolated flank detours lose.

Rationale: alignment compounds across ticks, but a single tick's cheap
kill saves ~1 strength. If the cheap kill is along the column we'd push
toward anyway, both effects compound; if it's perpendicular, we save
~1 strength but lose alignment momentum that may cost more downstream.
Weighted scoring lets us keep cheap-kill opportunism without disrupting
the kernel's emergent flocking.

Edge cases:
  - 0 or 1 cheap-kill candidates: identical to parent.
  - No cheap-kill candidates: identical to parent (falls through).

Tunables:
  CHEAP_KILL_RATIO (0.4): same as parent.
  SUPPORT_WEIGHT (0.8): higher = prefer alignment more aggressively;
  lower (toward 0) = converges to parent's pure-cost picking.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army) {
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return Conqueror.act(army);
    const tile = army.tile;
    if (!tile) return Conqueror.act(army);
    const neighbors = tile.neighbors;
    if (!neighbors) return Conqueror.act(army);

    const pid = army.player.id;
    const viewer = army.player;
    const cheapThreshold = sLimit * CHEAP_KILL_RATIO;

    let bestTarget = null;
    let bestScore = -Infinity;
    let bestCost = Infinity;

    for (let k = 0; k < 4; k++) {
      const t = neighbors[k];
      if (!t) continue;
      let hasFriendly = false;
      let enemy = 0;
      const armies = t.armies;
      for (let i = 0; i < armies.length; i++) {
        const a = armies[i];
        if (a.player.id === pid) {
          hasFriendly = true;
          break;
        }
        enemy += a.strength;
      }
      if (hasFriendly || enemy <= 0) continue;
      const needed = enemy / BONUS + 0.6;
      if (needed > cheapThreshold) continue;

      // Friendly support around the target, excluding our own source tile.
      // sumStrength is friendly-positive / enemy-negative, so a target
      // backed by our column scores higher than one in enemy land.
      let support = 0;
      const tn = t.neighbors;
      if (tn) {
        for (let m = 0; m < 4; m++) {
          const n = tn[m];
          if (n && n !== tile) support += sumStrength(n.armies, viewer);
        }
      }

      const score = support * SUPPORT_WEIGHT - needed;
      if (score > bestScore) {
        bestScore = score;
        bestCost = needed;
        bestTarget = t;
      }
    }

    if (bestTarget) {
      army.attack(bestTarget, bestCost);
      return;
    }
    return Conqueror.act(army);
  },
};
