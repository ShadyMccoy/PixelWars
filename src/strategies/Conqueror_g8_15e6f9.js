import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.6;
const BACKING_WEIGHT = 0.4;
const EXPOSURE_WEIGHT = 0.2;
const RETAKE_WEIGHT = 0.6;

const HEMI = (() => {
  const w = [], e = [], n = [], s = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const idx = i * 5 + j;
      const dx = j - 2;
      const dy = i - 2;
      if (dx < 0) w.push(idx);
      if (dx > 0) e.push(idx);
      if (dy < 0) n.push(idx);
      if (dy > 0) s.push(idx);
    }
  }
  return [w, e, n, s];
})();

const DIR_HINTS = (() => {
  const out = new Array(25);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const dy = i - 2;
      const dx = j - 2;
      if (dx === 0 && dy === 0) { out[i * 5 + j] = [-1, -1]; continue; }
      const horiz = dx < 0 ? 0 : 1;
      const vert = dy < 0 ? 2 : 3;
      let primary, secondary;
      if (Math.abs(dx) > Math.abs(dy)) {
        primary = horiz;
        secondary = dy === 0 ? -1 : vert;
      } else if (Math.abs(dy) > Math.abs(dx)) {
        primary = vert;
        secondary = dx === 0 ? -1 : horiz;
      } else {
        primary = horiz;
        secondary = vert;
      }
      out[i * 5 + j] = [primary, secondary];
    }
  }
  return out;
})();

function tryCommit(army, target, sLimit, pid) {
  const tArmies = target.armies;
  let friendlyArmy = null;
  let enemy = 0;
  for (let k = 0; k < tArmies.length; k++) {
    const a = tArmies[k];
    if (a.player.id === pid) friendlyArmy = a;
    else enemy += a.strength;
  }
  if (enemy > 0) {
    const needed = enemy / BONUS + 0.6;
    if (needed > sLimit) return false;
    army.attack(target, needed);
    return true;
  }
  if (friendlyArmy) {
    if (friendlyArmy.strength >= friendlyArmy.maxStrength - 0.5) return false;
    const room = friendlyArmy.maxStrength - friendlyArmy.strength;
    const power = Math.min(sLimit, room);
    if (power <= 0.5) return false;
    army.attack(target, power);
    return true;
  }
  army.attack(target, sLimit);
  return true;
}

// Parent Conqueror_g7_efa4e0 lost season #81 multiple times - notably
// 3 of 4 losses were to Conqueror_g8_4d842b, and 1 to
// Conqueror_g6_5a4345. These two winners refine Pass 1 (adjacent kill
// priority) along *different, structurally independent* axes:
//
//   - g8_4d842b adds an opposite-hemisphere EXPOSURE penalty: if we
//     punch into a wall, debit the score by enemy mass on the flank
//     we're abandoning. Stops kills that displace our garrison from
//     a contested seam to a cleaner one.
//
//   - g6_5a4345 adds a net RETAKE threat penalty: sum over the
//     target tile's *other* cardinal neighbors of
//     max(0, enemy - friendly). Stops kills where converging enemy
//     backups (or a single big one) are about to retake the tile
//     next tick, especially on lab1's 30x22 wrap where lanes feed
//     fast.
//
// These attack different blindspots. The parent's hemisphere
// backing score (from g5_ff0e8a) tells us which forward direction
// has structural depth worth puncturing; the exposure penalty tells
// us which forward direction is safe to commit *from*; the retake
// penalty tells us which kill will actually stick. They are all
// adjustments to the same Pass-1 score, structurally independent,
// and trivially additive.
//
// This descendant fuses both winning ideas into one Pass 1:
//
//   score = enemy
//         + 0.4 * forward_hemisphere_enemy_mass   // parent's bias
//         - 0.2 * opposite_hemisphere_enemy_mass  // 4d842b exposure
//         - 0.6 * sum_other_neighbors_max(0, enemy - friendly) // 5a4345 retake
//
// The forward bias still dominates (single tile worth 1.0, hemisphere
// spreads 0.4 over up to 10 cells). The exposure penalty is half the
// forward weight so it can't override a clean wall-puncture choice.
// The retake penalty matches 5a4345's tuned 0.6 - high enough to
// veto pyrrhic captures but low enough that an unopposed kill is
// still preferred over no action.
//
// Pass 2 (Conqueror.act fallback) and Pass 3 (5x5 stalemate routing
// with distance-first, path-clear tiebreak, weakness tiebreak) are
// unchanged from the parent. Tech is unchanged - both winners agreed
// the issue was target selection, not allocation.
//
// Failure mode if this is wrong: too cautious, declines kills the
// parent would take. Recovery: if the no-kill case fires more often,
// Pass 2 still routes to Conqueror.act, and Pass 3 still handles
// stalemates - we just sit on a marginal kill instead of trading
// poorly.
export default {
  name: "Conqueror_g8_15e6f9",
  author: "claude",
  version: 1,
  description: "Conqueror_g7 fused with 4d842b's exposure penalty and 5a4345's net retake threat.",
  summary: `Parent Conqueror_g7_efa4e0 lost season #81 four times -
three losses to Conqueror_g8_4d842b and one to Conqueror_g6_5a4345.
Both winners refine the same Pass 1 (adjacent kill priority) along
structurally independent axes:

  - 4d842b: opposite-hemisphere EXPOSURE penalty (-0.2 * enemy mass
    behind us). Avoids displacing the garrison off a contested seam.

  - 5a4345: net RETAKE threat (-0.6 * sum over target's other
    neighbors of max(0, enemy - friendly)). Avoids pyrrhic captures
    where converging backups retake next tick.

The parent only has the forward hemisphere backing bias (+0.4),
which tells us which direction has depth worth puncturing but
ignores both flank exposure and retake stickiness. These three
score adjustments hit different blindspots and add cleanly.

This descendant fuses all three:

  score = enemy
        + 0.4 * forward_hemisphere_enemy
        - 0.2 * opposite_hemisphere_enemy
        - 0.6 * net_retake_threat

Pass 2 and Pass 3 are unchanged from the parent. Tech is unchanged
{move:90, stack:0, prod:2, atk:4, def:4} - both winners agreed the
fix is in target selection, not allocation.

Failure mode: over-cautious target rejection. Mitigation: forward
bias still dominates per-tile (1.0 vs 0.4 spread); penalties only
break ties or veto kills with strong opposing-flank/retake mass.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) {
      Conqueror.act(army, game);
      return;
    }
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const stencil = tile.stencil5;
    const viewer = army.player;

    // Pass 1: best beatable adjacent enemy by fused score:
    //   forward backing (+) + opposite exposure (-) + retake threat (-)
    let bestKill = null;
    let bestScore = -Infinity;
    let bestNeeded = 0;
    let hasOtherTarget = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasOtherTarget = true; continue; }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (enemy > 0) {
        const needed = enemy / BONUS + MARGIN;
        if (needed > sLimit) continue;

        // Hemisphere terms: forward backing (push toward depth)
        // and opposite exposure (penalize abandoning a flank).
        let backing = 0;
        let exposure = 0;
        if (stencil) {
          const idxs = HEMI[i];
          for (let k = 0; k < idxs.length; k++) {
            const cell = stencil[idxs[k]];
            if (!cell) continue;
            const cArmies = cell.armies;
            if (cArmies.length === 0) continue;
            const e = -sumStrength(cArmies, viewer);
            if (e > 0) backing += e;
          }
          // Opposite hemisphere: i ^ 1 maps W<->E and N<->S.
          const oppIdxs = HEMI[i ^ 1];
          for (let k = 0; k < oppIdxs.length; k++) {
            const cell = stencil[oppIdxs[k]];
            if (!cell) continue;
            const cArmies = cell.armies;
            if (cArmies.length === 0) continue;
            const e = -sumStrength(cArmies, viewer);
            if (e > 0) exposure += e;
          }
        }

        // Retake threat: sum over target's *other* cardinal
        // neighbors of max(0, enemy - friendly). Per-tile clip
        // at zero so a fat friendly on one side cannot mask a
        // real enemy on a different side (movement resolves one
        // direction at a time next tick).
        let netThreat = 0;
        const tn = t.neighbors;
        for (let j = 0; j < 4; j++) {
          const tt = tn[j];
          if (!tt || tt === tile) continue;
          const ttArmies = tt.armies;
          let tnE = 0;
          let tnF = 0;
          for (let k = 0; k < ttArmies.length; k++) {
            const a = ttArmies[k];
            if (a.player.id === pid) tnF += a.strength;
            else tnE += a.strength;
          }
          const net = tnE - tnF;
          if (net > 0) netThreat += net;
        }

        const score =
          enemy
          + BACKING_WEIGHT * backing
          - EXPOSURE_WEIGHT * exposure
          - RETAKE_WEIGHT * netThreat;
        if (score > bestScore) {
          bestScore = score;
          bestKill = t;
          bestNeeded = needed;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }
    if (bestKill) {
      army.attack(bestKill, bestNeeded);
      return;
    }

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 with distance-first, path-clear
    // tiebreak, weakness as final tiebreak. (Unchanged from parent.)
    if (!stencil) return;

    const passCache = [-1, -1, -1, -1];
    const isPassable = (dir) => {
      let v = passCache[dir];
      if (v >= 0) return v;
      const n = neighbors[dir];
      if (!n) { passCache[dir] = 0; return 0; }
      const armies = n.armies;
      if (armies.length === 0) { passCache[dir] = 1; return 1; }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (enemy > 0) {
        v = (enemy / BONUS <= sLimit + 0.5) ? 1 : 0;
      } else if (friendlyArmy) {
        v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
      } else {
        v = 1;
      }
      passCache[dir] = v;
      return v;
    };

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestClear = -1;
    let bestWeak = Infinity;
    for (let i = 0; i < 25; i++) {
      const hints = DIR_HINTS[i];
      if (hints[0] < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const enemy = -sumStrength(t.armies, viewer);
      if (enemy <= 0) continue;
      if (enemy / BONUS > sLimit + 0.5) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      const clear = isPassable(hints[0]);
      if (
        dist < bestDist
        || (dist === bestDist && clear > bestClear)
        || (dist === bestDist && clear === bestClear && enemy < bestWeak)
      ) {
        bestDist = dist;
        bestClear = clear;
        bestWeak = enemy;
        bestPrim = hints[0];
        bestSec = hints[1];
      }
    }
    if (bestPrim < 0) return;

    const primaryTarget = neighbors[bestPrim];
    if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
    if (bestSec < 0) return;
    const secondaryTarget = neighbors[bestSec];
    if (secondaryTarget) tryCommit(army, secondaryTarget, sLimit, pid);
  },
};
