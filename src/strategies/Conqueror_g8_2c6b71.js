import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const BACKING_WEIGHT = 0.4;

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

// Per cardinal direction (W=0, E=1, N=2, S=3) the stencil5 indices
// strictly in that hemisphere - excludes the orthogonal axis so the
// four hemispheres do not double-count the cells directly beside us.
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

// Parent Conqueror_g7_31769b lost season #70 in two matchups, one to
// its sibling Conqueror_g7_0cfdd6 and one to a Conqueror_g4_3fd4ce.
// Both winners share Pass 3 improvements that the parent doesn't:
//
//   * g7_0cfdd6 replaced the 2-level (0/1) path-clear score with a
//     4-level metric that distinguishes secondary-only routing from
//     fully blocked: clear = primary_passable*2 + secondary_passable.
//     tryCommit on a stencil pick first attempts the primary axis and
//     falls back to the secondary; the parent's binary clear score
//     collapses "secondary-only" into the same bucket as "blocked",
//     so equidistant ties can pick a fully unreachable target over a
//     sibling reachable via the secondary lane.
//
//   * g4_3fd4ce tightened the eligibility threshold from sLimit + 0.5
//     to sLimit - 0.6, matching tryCommit's actual commit margin
//     (needed = enemy/BONUS + 0.6 must be <= sLimit, so
//     enemy/BONUS <= sLimit - 0.6 is the actually-reachable bound).
//     Targets we can't reach no longer crowd out targets we can.
//
// The parent kept g6's looser threshold and binary path-clear and
// only changed Pass 1 (hemisphere-weighted target scoring). That
// Pass 1 change is real - it's how this branch beat g6 - so we keep
// it. But Pass 3 lags both winning siblings, and it shows in head-
// to-head losses. This descendant is the natural three-way merge:
// Pass 1 keeps hemisphere-weighted scoring (from parent), Pass 3
// adopts the 4-level path-clear AND tighter threshold (from the two
// siblings that beat us).
//
// Tech is unchanged: {move:90, stack:0, prod:2, atk:4, def:4}, the
// shared optimum across the entire winning Conqueror cousin lineage.
export default {
  name: "Conqueror_g8_2c6b71",
  author: "claude",
  version: 1,
  description: "g7_31769b's hemisphere Pass 1 + g7_0cfdd6's two-axis path-clear + g4_3fd4ce's tightened threshold.",
  summary: `Parent Conqueror_g7_31769b lost season #70 to its
sibling Conqueror_g7_0cfdd6 and to a Conqueror_g4_3fd4ce. Both
winners share Pass 3 improvements the parent omits:

  * g7_0cfdd6: 4-level path-clear score (primary*2 + secondary)
    distinguishes secondary-only routing from fully blocked. The
    parent's binary clear=0/1 collapses both into one bucket, so
    equidistant ties can pick an unreachable target over a sibling
    reachable via the secondary lane.

  * g4_3fd4ce: tighter eligibility threshold (sLimit - 0.6 vs
    sLimit + 0.5), matching tryCommit's actual commit margin so
    truly unreachable targets never enter the competition.

The parent kept g6's looser threshold and binary path-clear and
only changed Pass 1 (hemisphere-weighted adjacent target scoring).
That Pass 1 change is real and earned the parent its win over g6,
so we keep it. The Pass 3 changes are independent improvements
that already beat the parent in head-to-head.

This descendant is the natural three-way merge:
  Pass 1: hemisphere-weighted scoring (from parent g7_31769b).
  Pass 3: 4-level path-clear AND tightened threshold (from the
          siblings g7_0cfdd6 and g4_3fd4ce respectively).

Tech, kernel structure, MARGIN, DIR_HINTS, HEMI tables, and the
path-clear cache are unchanged. The only behavioral differences vs
the parent are scoped to Pass 3 target selection.`,
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

    // Pass 1: best beatable adjacent enemy by hemisphere-weighted score.
    let bestKill = null;
    let bestScore = -1;
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
        const needed = enemy / BONUS + 0.6;
        if (needed > sLimit) continue;
        let backing = 0;
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
        }
        const score = enemy + BACKING_WEIGHT * backing;
        if (score > bestScore) {
          bestScore = score;
          bestNeeded = needed;
          bestKill = t;
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

    // Pass 3: full stalemate. 5x5 with distance-first, two-axis
    // path-clear tiebreak, weakness as final tiebreak.
    if (!stencil) return;
    // Match tryCommit: needed = enemy/BONUS + 0.6 must be <= sLimit,
    // so enemy/BONUS <= sLimit - 0.6 is the actually-reachable bound.
    const reachableEnemyOverBonus = sLimit - 0.6;

    // Cache neighbor passability for the four cardinal directions:
    //   1  = passable (empty, friendly with room, or beatable enemy)
    //   0  = blocked (no neighbor, strong enemy, or full friendly)
    // Both primary and secondary axes are queried so we can score
    // stencil routing on what tryCommit will actually do.
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
        v = (enemy / BONUS <= sLimit - 0.6) ? 1 : 0;
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
      if (enemy / BONUS > reachableEnemyOverBonus) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      const primClear = isPassable(hints[0]);
      const secClear = hints[1] >= 0 ? isPassable(hints[1]) : 0;
      const clear = primClear * 2 + secClear;
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
