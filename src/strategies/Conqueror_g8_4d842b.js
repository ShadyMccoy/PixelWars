import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const BACKING_WEIGHT = 0.4;
const EXPOSURE_WEIGHT = 0.2;

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

// Parent Conqueror_g7_31769b dominated season #80 with no recorded
// losses, so this descendant explores a structurally new mechanism
// rather than tuning what already works.
//
// The parent's Pass 1 scores adjacent kill candidates as
// `enemy + 0.4 * hemisphere_backing`. That biases the kill toward
// the side with real depth (the "wall-piercing" insight from
// g5_ff0e8a). What it ignores is what's *behind us* when we commit
// forward. If two enemies of comparable size press from opposite
// hemispheres, the parent will push toward whichever side has
// deeper backing - even if pushing that way leaves a heavier
// opposite flank with no garrison facing it. The kill succeeds but
// the army displaces from a contested seam to a less contested one.
//
// This descendant adds an exposure penalty: when scoring a kill,
// subtract a fraction of the *opposite* hemisphere's net-enemy
// strength. With EXPOSURE_WEIGHT=0.2 (half the wall-piercing
// weight), the penalty is small enough to never override a clear
// wall-puncture choice, but big enough to break ties in favor of
// the seam where our flank isn't already loaded. When the opposite
// hemisphere is empty (the common case in a clean push), score is
// identical to the parent and behavior is unchanged.
//
// The reciprocal direction is `i ^ 1`: W(0)<->E(1), N(2)<->S(3).
//
// Tech, MARGIN=0.6, BACKING_WEIGHT=0.4, sizing, the path-clear
// cache, DIR_HINTS, HEMI, Pass 2, and Pass 3 are all unchanged
// from the parent. The only behavioral difference is Pass 1's
// target choice when more than one adjacent kill is beatable AND
// at least one of them has enemy presence on its opposite flank.
export default {
  name: "Conqueror_g8_4d842b",
  author: "claude",
  version: 1,
  description: "Conqueror_g7 + opposite-hemisphere exposure penalty in Pass 1.",
  summary: `Parent Conqueror_g7_31769b dominated season #80 with no
recorded losses, so the only useful exploration is a new mechanism
rather than a re-tune of an already winning constant.

The parent's Pass 1 scores adjacent kills with hemisphere-weighted
backing - it picks the kill whose *forward* hemisphere is deepest.
It ignores the *backward* hemisphere entirely. In a typical
mid-game configuration this is fine: the backward hemisphere is
our own territory. But in the contested-seam case where two
enemies press from opposite sides, the parent will push toward
whichever forward hemisphere has more depth, even when that
displaces our garrison away from a comparably loaded opposite
flank.

This descendant adds an exposure penalty: each adjacent kill
candidate's score is debited by 0.2 * opposite-hemisphere net
enemy strength. The weight is half BACKING_WEIGHT so it can never
override a clear wall-puncture decision; it only breaks ties when
both kills have similar forward backing. When no opposite-flank
threat exists (the common case), the score equals the parent's
score and behavior is identical.

Failure mode if this is wrong: the bot becomes too cautious about
committing into a wall when there happens to be enemy noise behind
it. Counter: EXPOSURE_WEIGHT=0.2 keeps the penalty smaller than
even a single deep enemy in the forward hemisphere. Tech, MARGIN,
BACKING_WEIGHT, and Passes 2-3 are unchanged.`,
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

    // Pass 1: best beatable adjacent enemy by hemisphere-weighted
    // score, debited by opposite-hemisphere exposure.
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
        const needed = enemy / BONUS + 0.6;
        if (needed > sLimit) continue;
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
          // Opposite hemisphere: the flank we abandon by pushing here.
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
        const score = enemy + BACKING_WEIGHT * backing - EXPOSURE_WEIGHT * exposure;
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

    // Pass 3: full stalemate. 5x5 with distance-first, path-clear
    // tiebreak, weakness as final tiebreak.
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
