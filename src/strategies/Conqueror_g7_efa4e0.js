import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.6;
const BACKING_WEIGHT = 0.4;

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

// Parent g6_aa7266 lost season #39 (seed=27, finished #4 of 6) with
// Conqueror_g5_ff0e8a as the winner. ff0e8a is a sibling cousin of
// the parent: it took the SAME tech {move:90, stack:0, prod:2, atk:4,
// def:4} but added 2-deep hemisphere-weighted threat scoring on the
// adjacent kill (Pass 1). The parent g6 instead invested its delta in
// a Pass-3 path-clear tiebreak for stalemates.
//
// These two improvements are independent and stack: ff0e8a refines
// WHICH adjacent enemy to break, g6 refines HOW to route during
// 5x5 stalemates. The parent's loss to ff0e8a is direct evidence
// that the hemisphere score actually matters in head-to-head. So
// this descendant fuses both:
//
//   Pass 1 (kill priority): score adjacent beatable enemies by
//     enemy + BACKING_WEIGHT * hemisphere_enemy_mass, exactly as
//     ff0e8a does. This biases punching toward the side with more
//     structural depth (the "wall" hemisphere) instead of the
//     thinnest facade. ff0e8a's Pass 1 had no friendly-stack
//     intent tracking; the parent's Pass 1 did. Keep the parent's
//     hasOtherTarget tracking so Pass 2 still triggers Conqueror's
//     friendly-stack/empty-tile handling when the kill list is empty.
//
//   Pass 2 (fallback): unchanged - Conqueror.act handles any other
//     adjacent action.
//
//   Pass 3 (stalemate): unchanged from parent g6 - distance-first,
//     path-clear tiebreak, weakness tiebreak in the 5x5 stencil.
//
// No tech change. {move:90, stack:0, prod:2, atk:4, def:4} is the
// shared optimum that produced both the parent and the bot that
// beat it; the loss was about kill priority, not tech.
export default {
  name: "Conqueror_g7_efa4e0",
  author: "claude",
  version: 1,
  description: "Conqueror_g6 + ff0e8a's 2-deep hemisphere-weighted adjacent kill priority.",
  summary: `Parent Conqueror_g6_aa7266 lost season #39 (seed=27,
finished #4 of 6) with Conqueror_g5_ff0e8a winning. ff0e8a is a
sibling on the same tech {move:90, stack:0, prod:2, atk:4, def:4}
that invested its delta differently: it added 2-deep hemisphere-
weighted threat scoring on Pass 1 (adjacent kill priority). The
parent g6 instead invested in a Pass-3 path-clear tiebreak for 5x5
stalemates. The parent's direct loss to ff0e8a is evidence the
hemisphere score is paying off in head-to-head play.

These two improvements are structurally independent (kill-priority
selection vs stalemate routing) and trivially stackable. This
descendant fuses them:

  Pass 1: among beatable adjacent enemies, score by
    enemy + 0.4 * (sum of enemy strength in that direction's
    hemisphere of the 5x5 stencil). Adjacent value still dominates
    (1.0 vs 0.4 spread over up to 10 cells); ties and near-ties go
    to the side with more enemy depth - the structural mass worth
    puncturing first vs Membrane-style walls. Kept the parent's
    hasOtherTarget tracking so Pass 2 still fires when Pass 1 has
    no kill but other adjacent action exists (friendly stack or
    empty tile).

  Pass 2: unchanged - Conqueror.act handles other adjacent action.

  Pass 3: unchanged from parent g6 - 5x5 stencil with distance-
    first, path-clear tiebreak, weakness as final tiebreak.

Tech unchanged. The parent's loss was about target selection in
Pass 1, not allocation.`,
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
    // threat score. Track hasOtherTarget for Pass 2 fallback.
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
        const needed = enemy / BONUS + MARGIN;
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
    // tiebreak, weakness as final tiebreak. (Unchanged from g6.)
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
