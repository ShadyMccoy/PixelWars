import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const BACKING_WEIGHT = 0.4;
// Friendly net strength behind a candidate is a softer signal than
// enemy backing - it implies follow-up momentum rather than direct
// disruption value - so it's weighted lower.
const FRIENDLY_WEIGHT = 0.25;

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

// Parent Conqueror_g8_2c6b71 dominated season #87 with no losses
// recorded, so there's no obvious failure to repair. The change here
// is an extension of an asymmetry in the parent's hemisphere scoring
// rather than a fix for a defeat.
//
// Pass 1 in the parent scores adjacent kill candidates by:
//   score = enemy + BACKING_WEIGHT * enemyBackingInHemi
// preferring targets that disrupt the largest enemy cluster behind
// them. But the same hemisphere stencil also reveals my own forces
// in that direction. When two adjacent enemies are equally beatable
// and have similar enemy backing, the one supported by my own
// follow-up forces is the better commitment: next tick I'll have
// something at hand to consolidate the captured tile and keep
// pushing.
//
// This descendant adds a FRIENDLY_WEIGHT term to the same loop. The
// weight is lower than BACKING_WEIGHT (0.25 vs 0.4) because friendly
// backing is a softer signal - it suggests momentum but doesn't
// directly imply disruption value the way clustered enemies do.
//
// Pass 3 stays unchanged. Its existing tiebreak (clear score) already
// captures part of the same intuition for non-adjacent targets, and
// extending hemisphere scoring there is a larger change with less
// obvious sign. Tech is unchanged - the lineage's shared optimum.
export default {
  name: "Conqueror_g9_4b8dd5",
  author: "claude",
  version: 1,
  description: "g8_2c6b71 + Pass 1 friendly-backing momentum tiebreak.",
  summary: `Parent Conqueror_g8_2c6b71 dominated season #87 (no
recorded losses), so this descendant is exploration rather than a
fix.

Pass 1's hemisphere score in the parent only counts enemy backing
behind a candidate (disruption value). The same hemisphere stencil
also tells us about our own forces in that direction, which is a
follow-up momentum signal: a kill in a hemisphere where we have
reinforcements lets us consolidate the captured tile next tick
instead of leaving it isolated. Adding friendly backing as a
secondary positive term breaks ties between equally-strong adjacent
kills toward the direction we're already invested in.

Friendly backing is weighted lower than enemy backing (0.25 vs
0.4): clustered enemies imply concrete disruption value when killed,
while friendly backing only implies indirect follow-up potential.
The weight is small enough that the term acts mainly as a tiebreak,
not a redirect.

Pass 3 (5x5 stalemate search) is unchanged - its tiebreak already
biases toward reachable cardinals via the path-clear score, and
mixing hemisphere scoring there would be a larger change with less
obvious sign. Tech, kernel structure, MARGIN, DIR_HINTS, HEMI
tables, and the path-clear cache are all unchanged.

Tech: {move:90, stack:0, prod:2, atk:4, def:4}, the shared optimum
across the winning Conqueror cousin lineage.`,
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
    // score. Score combines enemy backing (disruption value) and
    // friendly backing (follow-up momentum) with a smaller weight on
    // the latter.
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
        let enemyBacking = 0;
        let friendlyBacking = 0;
        if (stencil) {
          const idxs = HEMI[i];
          for (let k = 0; k < idxs.length; k++) {
            const cell = stencil[idxs[k]];
            if (!cell) continue;
            const cArmies = cell.armies;
            if (cArmies.length === 0) continue;
            const net = sumStrength(cArmies, viewer);
            if (net < 0) enemyBacking += -net;
            else if (net > 0) friendlyBacking += net;
          }
        }
        const score = enemy
          + BACKING_WEIGHT * enemyBacking
          + FRIENDLY_WEIGHT * friendlyBacking;
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
    const reachableEnemyOverBonus = sLimit - 0.6;

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
