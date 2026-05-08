import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.6;
const BACKING_WEIGHT = 0.4;
// Territory bias: +0.3 per friendly-owned neighbor of the candidate
// kill tile. Magnitude bounded at +1.2 (4 neighbors), well below the
// weight of an enemy strength unit, so it only flips ranking on
// near-ties. See hypothesis comment below.
const TERRITORY_BIAS = 0.3;

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

// Hypothesis: parent Conqueror_g7_efa4e0 has been beaten in season
// #110 multiple times, including by Conqueror_g9_01de66 (winner of
// seed=26 and seed=14). g9_01de66 is essentially a sibling of the
// parent on the same hemisphere-weighted Pass 1 thesis but with one
// extra lever stacked on top: a +0.3 territory bias per friendly-
// owned neighbor of the kill target tile.
//
// The two scoring components are orthogonal:
//   - HEMI backing (parent's lever): measures ENEMY structural depth
//     in the target's direction. Picks WHICH SIDE is worth puncturing.
//   - TERRITORY bias (this descendant): measures FRIENDLY ownership
//     around the target. Picks the punch that CONSOLIDATES (capture
//     holds, recapture is expensive) over the punch that DILUTES
//     (capture flips back next tick because no friendly neighbors
//     contest a recapture).
//
// Composing them adds a single line and ~5 lines of neighbor scan;
// this is the minimal extension of the parent that matches the bot
// which beat it most decisively (g9_01de66 won seed=14 over the
// parent at 509 ticks). I am intentionally NOT also pulling in
// g9_01de66's walk-all-candidates Pass 3, tryNoMarginKill Pass 4, or
// any margin tweak - keep the change small enough that the season
// can isolate the effect of the territory lever specifically. If
// this descendant lifts vs parent, the territory hypothesis is
// validated; if it doesn't, the gap to g9_01de66 was somewhere else
// in its kernel and we'll know that next iteration.
//
// Magnitudes: max territory bonus is +1.2 (4 friendly neighbors at
// 0.3 each) and max hemisphere bonus is around +3 (8 cells of
// meaningful enemy mass at 0.4). Adjacent enemy strength still
// dominates (an enemy of 2.0 already outweighs the full territory
// max), so genuine threats are still killed first - the bias only
// reorders near-ties.
//
// Tech unchanged from the lineage anchor.
export default {
  name: "Conqueror_g8_bfcb0e",
  author: "claude",
  version: 1,
  description: "Conqueror_g7_efa4e0 + g9_01de66's +0.3-per-friendly-neighbor territory bias on Pass 1 kill priority.",
  summary: `Parent Conqueror_g7_efa4e0 lost season #110 multiple times,
including to Conqueror_g9_01de66 (winner of seed=26 and seed=14).
g9_01de66 is the smallest cousin step from the parent: same Pass 1
hemisphere-weighted scoring, with a +0.3 territory bias per
friendly-owned neighbor of the candidate kill target stacked on top.

The two components are orthogonal:
  - HEMI backing measures enemy structural depth in our direction
    (which side is worth puncturing).
  - TERRITORY bias measures friendly ownership around the target
    (whether the capture consolidates or dilutes - a kill into a
    tile with friendly neighbors holds, an isolated kill flips
    back next tick).

Pass 1 score becomes
  enemy + 0.4 * hemisphere_backing + 0.3 * friendly_neighbors

Magnitudes are well-bounded. Territory bias maxes at +1.2 (4 of 4
neighbors friendly); hemisphere backing maxes around +3 (8 cells of
strong enemy mass). Adjacent enemy strength still dominates - an
enemy of 2.0 alone outweighs the entire territory bonus - so the
parent's defense thesis (kill the strongest membrane threat first)
is preserved; the bias only reorders near-ties.

Holding everything else from the parent constant - Pass 2 falls
through to Conqueror.act, Pass 3 stays the parent's distance/path-
clear/weakness 5x5 stencil. This is the minimal extension that
matches the dominant winner against the parent in season #110, and
isolates the territory lever for measurement. If lift confirms,
future descendants can layer additional pieces of g9_01de66
(walk-all-candidates Pass 3, no-margin Pass 4) on top.

Tech unchanged at the GA-optimum {move:90, stack:0, prod:2, atk:4,
def:4}.`,
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
    // threat score + territory bias (g9_01de66's lever).
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

        let friendlyNbrs = 0;
        const tn = t.neighbors;
        for (let n = 0; n < 4; n++) {
          const nt = tn[n];
          if (nt && nt.ownerId === pid) friendlyNbrs++;
        }

        const score = enemy + BACKING_WEIGHT * backing + TERRITORY_BIAS * friendlyNbrs;
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
