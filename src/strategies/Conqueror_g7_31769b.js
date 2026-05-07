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

// Parent Conqueror_g6_aa7266 lost season #42 in two matchups, one to
// its sibling Conqueror_g5_ff0e8a (the bot that originally introduced
// the hemisphere-weighted adjacent-target scoring) and one to a plain
// Conqueror_g1_879a88. The first loss is the structural one: g5_ff0e8a
// fixed the membrane-vs-facade pathology by scoring adjacent kill
// candidates as `enemy + 0.4 * hemisphere_backing` instead of by raw
// adjacent strength alone. That biases the kill toward the side with
// real enemy depth (a wall) instead of toward the loudest single
// facade tile. g6 kept the original raw-strength scoring and just
// added a 5x5 stalemate fallback on top, so against a wall with multi-
// directional facades g6 still picks the wrong opening before any of
// its later passes get a chance to fire.
//
// This descendant merges the two improvements that have actually
// produced wins in this lineage:
//   Pass 1 - adjacent kill, scored with g5_ff0e8a's hemisphere
//            backing weight (enemy + 0.4 * hemisphere depth).
//   Pass 2 - any other adjacent target -> Conqueror.act (g6's pass).
//   Pass 3 - 5x5 stalemate fallback with distance-first, path-clear
//            tiebreak, weakness as final tiebreak (g6's pass).
//
// Tech is unchanged: {move:90, stack:0, prod:2, atk:4, def:4}, the
// shared optimum across the entire winning Conqueror cousin lineage.
// Margins, sizing, and the path-clear cache are unchanged from g6.
// The only behavioral difference vs g6 is which adjacent enemy
// gets picked when there are multiple beatable ones - and that is
// exactly the change that produced g5_ff0e8a's win over the parent.
export default {
  name: "Conqueror_g7_31769b",
  author: "claude",
  version: 1,
  description: "Conqueror_g6 + g5_ff0e8a's hemisphere-weighted adjacent target scoring.",
  summary: `Parent Conqueror_g6_aa7266 lost in season #42 to its
sibling Conqueror_g5_ff0e8a. The sibling's edge is its Pass 1
target-selection rule: adjacent kill candidates are scored as
enemy + 0.4 * hemisphere_backing instead of by raw adjacent
strength. Against wall-like structures (Membrane, dense Conqueror
formations) the loudest adjacent tile is often a thin facade with
the real mass one step behind it; raw-strength scoring picks the
facade and never punctures the wall, while hemisphere-weighted
scoring biases toward the side with structural depth.

This descendant is the natural merge of the two strongest cousins
in this lineage: g5_ff0e8a's hemisphere-weighted Pass 1 in front of
g6_aa7266's 3-pass kernel (Pass 1 -> Conqueror.act -> 5x5 stalemate
with path-clear tiebreak). g5_ff0e8a falls straight from its Pass 1
to Conqueror.act and so loses g6's stalemate handling; g6 keeps the
stalemate handling but reverts to raw-strength Pass 1. This bot has
both.

Tech, sizing, MARGIN=0.6, the path-clear cache, and DIR_HINTS are
unchanged from g6. The only behavioral difference vs the parent is
which adjacent enemy Pass 1 picks when several are beatable -
exactly the lever that already beat the parent in head-to-head play.`,
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

    // Pass 3: full stalemate. 5x5 with distance-first, path-clear
    // tiebreak, weakness as final tiebreak.
    if (!stencil) return;

    // Cache neighbor passability for the four cardinal directions:
    //   1  = passable (empty, friendly with room, or beatable enemy)
    //   0  = blocked (no neighbor, strong enemy, or full friendly)
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
