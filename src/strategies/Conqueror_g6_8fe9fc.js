import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

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

// How many enemy-controlled tiles surround `target`. A higher count
// means capturing this tile cracks open more enemy frontage on the
// next tick (we land adjacent to more enemy territory). Used only as
// a tiebreak when two beatable adjacent kills have ~equal strength.
function enemyExposure(target, pid) {
  const ns = target.neighbors;
  let count = 0;
  for (let i = 0; i < 4; i++) {
    const n = ns[i];
    if (!n) continue;
    const oid = n.ownerId;
    if (oid !== 0 && oid !== pid) count++;
  }
  return count;
}

// Parent Conqueror_g5_5003d1 lost season #15 seed=57 (#5 of 6) to
// the near-identical kin Conqueror_g5_cabbd8 (#1). The two bots are
// behaviorally equivalent in the priority-kill scan, the Conqueror.act
// fallback, and the closest-first 5x5 stencil pass — yet placed
// 5th and 1st in the same lineup. That gap is positional/timing,
// not algorithmic, but it does point at a real gap: when several
// adjacent enemies are all beatable, "strongest first" has no way
// to distinguish among ties at the maxArmy=6 cap (where ties are
// common) and falls back to iteration order (W,E,N,S). The wrong
// tie-broken choice can leave a defensive cluster intact for
// another tick of pressure.
//
// This descendant adds one tiebreak to Pass 1: among beatable
// adjacent enemies whose strengths are within 0.3 of the current
// best, prefer the one whose tile has more enemy-owned neighbors.
// Capturing such a tile lands us adjacent to more enemy frontage
// on the next tick, which feeds the priority kill again and shrinks
// the cluster faster. When no near-tie exists, behavior is identical
// to the parent: still strongest-first, still min-overkill sizing,
// still closest-first 5x5 fallback.
//
// Tech, the rest of Pass 1, all of Pass 2, and Pass 3 are byte-
// identical to the parent. No new state, no new strategy axis —
// just one comparator refinement targeting the failure mode of
// "two equally-strong adjacent enemies, picked the wrong one".
export default {
  name: "Conqueror_g6_8fe9fc",
  author: "claude",
  version: 1,
  description: "Conqueror_g5_5003d1 + enemy-exposure tiebreak on the priority adjacent kill.",
  summary: `Parent g5_5003d1 lost season #15 seed=57 (#5 of 6) to
near-identical kin g5_cabbd8 (#1). The two bots are algorithmically
equivalent in their priority kill, Conqueror.act fallback, and
closest-first 5x5 pass; placement gap was positional timing. But
the parent's strongest-first priority kill has no real tiebreak
among beatable adjacent enemies — at maxArmy=6 ties are common and
W,E,N,S iteration order decides them.

Add one tiebreak: when two beatable adjacent enemies are within 0.3
strength of each other, prefer the one whose tile has more enemy-
owned neighbors. Capturing such a tile lands us adjacent to more
enemy frontage next tick, which re-feeds the priority kill and
collapses defensive clusters faster. When no near-tie exists,
behavior is byte-identical to the parent. Tech, Pass 2 (Conqueror.act
deferral), and Pass 3 (closest-first 5x5 with weakest-tiebreak) are
unchanged — keeping the proven {move:90, stack:0, prod:2, atk:4, def:4}
GA optimum and the parent's distinguishing fallback bet.`,
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

    // Pass 1: strongest beatable adjacent enemy, with enemy-exposure
    // tiebreak when strengths are within 0.3 of each other.
    let bestKill = null;
    let bestEnemy = -1;
    let bestNeeded = 0;
    let bestExposure = -1;
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
        let take = false;
        if (enemy > bestEnemy + 0.3) {
          take = true;
        } else if (enemy >= bestEnemy - 0.3) {
          // Near-tie: break by exposure (more enemy-owned neighbors
          // => capturing here exposes more enemy frontage next tick).
          const exp = enemyExposure(t, pid);
          if (exp > bestExposure || (exp === bestExposure && enemy > bestEnemy)) {
            take = true;
            bestExposure = exp;
          }
        }
        if (take) {
          bestEnemy = enemy;
          bestNeeded = needed;
          bestKill = t;
          if (bestExposure < 0) bestExposure = enemyExposure(t, pid);
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

    // Pass 3: full stalemate. 5x5 with closest-first selection
    // (g4_868391 comparator) and primary/secondary axis fallback.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
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
      if (dist < bestDist || (dist === bestDist && enemy < bestWeak)) {
        bestDist = dist;
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
