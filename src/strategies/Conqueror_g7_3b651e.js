import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.6;
const BACKING_WEIGHT = 0.4;

// Hemisphere indices for the 5x5 stencil. W=0, E=1, N=2, S=3 -> the
// stencil cells on that side, with axis cells excluded so hemispheres
// don't overlap. Used to score adjacent kill candidates by how much
// enemy mass sits behind each direction.
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
    const needed = enemy / BONUS + MARGIN;
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

// Parent Conqueror_g6_aa7266 lost season #29 (seed=1) to its sibling
// Conqueror_g6_936d2f - finished #5 of 6 with 936d2f winning. The
// two siblings share the same lineage but diverged on which Pass to
// upgrade:
//
//   - 936d2f rewrote Pass 1 (adjacent kill) to use hemisphere-
//     weighted scoring: kill the side with the most enemy mass
//     sitting behind the adjacent target, not just the strongest
//     adjacent body. Punches through walls in the right place.
//
//   - aa7266 (our parent) kept g5's strongest-first adjacent kill
//     and instead upgraded Pass 3 (5x5 stencil fallback) with a
//     path-clear tiebreak: among equally-close stencil targets,
//     prefer the one whose primary cardinal lane is currently
//     passable. Converts more stencil intent into actual motion.
//
// The losing seed shows the picks aren't equivalent: 936d2f's
// hemisphere weighting won the head-to-head. But aa7266's path-clear
// tiebreak is a real fix in a different pass and there's no reason
// to lose it.
//
// This descendant composes both:
//   Pass 1: hemisphere-weighted adjacent kill (from 936d2f)
//   Pass 2: Conqueror.act for any other adjacent move
//   Pass 3: closest-first 5x5 stencil with path-clear tiebreak
//           (from aa7266), unchanged
//
// The two improvements run on different passes and on disjoint
// entry conditions (Pass 1 only fires when there's a beatable
// adjacent enemy; Pass 3 only fires when there's no adjacent move
// at all), so the composition is mechanical, not a redesign.
//
// Tech unchanged at 90/0/2/4/4 - this allocation is shared across
// the entire winning Conqueror_g5+ branch and there's no signal
// from this loss that tech is the problem.
export default {
  name: "Conqueror_g7_3b651e",
  author: "claude",
  version: 1,
  description: "Hemisphere-weighted adjacent kill (g6_936d2f) + path-clear stencil tiebreak (g6_aa7266).",
  summary: `Parent Conqueror_g6_aa7266 finished #5 of 6 in season
#29 seed=1, beaten by sibling Conqueror_g6_936d2f. Both g6 cousins
descend from g5 and each upgraded a different pass of the kernel:
aa7266 added a path-clear tiebreak to Pass 3 (5x5 stencil
fallback), while 936d2f rewrote Pass 1 to use hemisphere-weighted
adjacent kill scoring. The head-to-head says hemisphere weighting
won the matchup, but the path-clear tiebreak is a real improvement
in a separate pass and there is no reason to drop it.

g7_3b651e composes both improvements:

1. Pass 1 - HEMISPHERE-WEIGHTED ADJACENT KILL (from g6_936d2f).
   Score each beatable adjacent enemy as enemy + 0.4 * sum of
   enemy strength in that side's hemisphere of the 5x5 stencil.
   Picks the lane with deepest enemy backing rather than just the
   strongest adjacent body - more strategic value per kill,
   especially against Membrane-style facades.

2. Pass 2 - any other adjacent action defers to Conqueror.act.

3. Pass 3 - CLOSEST-FIRST 5x5 STENCIL WITH PATH-CLEAR TIEBREAK
   (from g6_aa7266). Pick the closest beatable stencil enemy;
   among ties, prefer the one whose primary cardinal lane is
   currently passable (empty, friendly with refill room, or
   beatable enemy); weakness as final tiebreak. Converts more
   stencil intent into one-tick motion during stalemates.

The two passes are mutually exclusive on entry (Pass 1 fires only
on beatable adjacent enemy; Pass 3 fires only when no adjacent
move exists), so they compose without interaction.

Tech unchanged at 90/0/2/4/4 - the shared optimum across the
winning lineage. No signal from this loss that the tech is wrong;
the signal is that the kill-scoring fix beat the path-clear fix
head-to-head, so we keep both.`,
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

    // Pass 1: hemisphere-weighted adjacent kill picker.
    let bestTile = null;
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
          bestTile = t;
          bestNeeded = needed;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }
    if (bestTile) {
      army.attack(bestTile, bestNeeded);
      return;
    }

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 with distance-first, path-clear
    // tiebreak, weakness as final tiebreak. Inherited from
    // g6_aa7266.
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
