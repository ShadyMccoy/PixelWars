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

// Parent Conqueror_g8_74e11b lost in season #78 to three Conqueror
// cousins. Two of those losses share a single dominant signal:
//
//   1) Conqueror_g2_e90f66 (seed=237) runs tech {80,0,0,4,16} —
//      a heavy def rebalance away from the parent's extreme move
//      loadout.
//   2) Conqueror_g6_20faee (seed=208) runs tech {75,0,2,13,10} —
//      a balanced rebalance that brings atk and def back toward
//      the 1.0x baseline.
//
// Both winners abandoned the parent's {90,0,2,4,4} allocation.
// At atk=4 / def=4 with slope 0.0030, both multipliers sit at
// 0.952x — every attack lands ~5% under the formula's assumed
// bonus, and every defense absorbs ~5% less than baseline. On
// lab1 (30x22 wrap, growth 1.8, maxArmy 12) fights are long
// exchange chains, so a sub-baseline atk/def compounds into
// territorial loss tick after tick. Meanwhile the marginal
// value of move=90 over move=75 is only ~0.15 strength per
// commit (linear garrison floor 1.5 - 0.005 * move) — a poor
// trade.
//
// The third loss (Conqueror_g5_d70030 at seed=136) ran the
// same tech as the parent and won via a different axis (a
// defensive guard that aborts a kill when the remainder would
// be overrun by a counter-attack from another cardinal). That's
// a real signal too, but it changes the kernel.
//
// SINGLE-AXIS DISCIPLINE: this descendant takes the parent's
// 3-pass kernel byte-for-byte (raw Pass 1, 4-level path-clear
// in Pass 3, tightened reachability threshold — all unchanged)
// and applies ONLY the tech rebalance to {75,0,2,13,10}, which
// is g6_20faee's proven allocation. If this wins, the tech axis
// is the dominant problem with the parent. If it doesn't, the
// next descendant should pivot to g5_d70030's kernel guard
// instead. Mixing both axes here would confound the signal.
//
// Note: the parent's lineage already chose move=90 as its GA
// optimum, but that decision predates the tech-multiplier
// system's current slopes; subsequent same-strategy mirror
// matches (the data above) have updated the picture toward
// balanced atk/def. The garrison floor at move=75 is 1.125 vs
// 1.05 at move=90 — still well below the 1.4 neutral, so the
// "minimum-overkill kills with full transfer" character of
// Conqueror is fully preserved.
export default {
  name: "Conqueror_g9_ff6438",
  author: "claude",
  version: 1,
  description: "Conqueror_g8 kernel verbatim with g6_20faee's balanced tech (75/0/2/13/10).",
  summary: `Parent Conqueror_g8_74e11b lost twice in season #78 to
cousins running noticeably more balanced tech: Conqueror_g2_e90f66
({80,0,0,4,16}, def-heavy) and Conqueror_g6_20faee ({75,0,2,13,10},
balanced). Both winners abandoned the parent's {90,0,2,4,4}
allocation. The diagnosis (lifted from g6_20faee's design note,
which already articulated this argument): with atk slope 0.0030 and
def slope 0.0030, atk=4 and def=4 land both multipliers at 0.952x —
every attack hits ~5% under the formula's assumed bonus, every
defense absorbs ~5% less than baseline. On lab1's long exchange
chains (30x22 wrap, growth 1.8, maxArmy 12) that compounds into
territorial loss. Meanwhile move=90 over move=75 buys only ~0.15
strength of forward power per commit, a poor trade for the atk/def
gap.

This descendant is a pure tech-only change: kernel byte-for-byte
identical to the parent (3-pass: raw-strength Pass 1 picking the
strongest beatable adjacent enemy with minimum-overkill commit;
Pass 2 deferring to Conqueror.act when other adjacent action exists;
Pass 3 5x5 stencil with distance-first sort, 4-level path-clear
tiebreak from g7_0cfdd6, and reachability threshold matched to
tryCommit's commit margin from g4_3fd4ce). Tech adopts
{75,0,2,13,10} — g6_20faee's allocation, validated against this
exact parent in season #78.

Single-knob discipline: keeping the kernel fixed turns this
match into a clean A/B between the parent's tech and g6_20faee's
tech on the SAME 3-pass kernel. The parent's kernel is more
sophisticated than g6_20faee's (which lacks the stencil fallback
entirely), so if balanced tech also helps the parent's kernel,
this descendant should outperform g6_20faee head-to-head as well.
The third loss in season #78 (to Conqueror_g5_d70030's kernel
guard) is a separate axis and is deliberately left for a future
descendant to test in isolation.`,
  tech: { move: 75, stack: 0, prod: 2, atk: 13, def: 10 },
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

    // Pass 1: strongest beatable adjacent enemy.
    let bestKill = null;
    let bestEnemy = -1;
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
        if (enemy > bestEnemy) {
          bestEnemy = enemy;
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

    // Pass 3: full stalemate. 5x5 with distance-first, 4-level
    // path-clear tiebreak, weakness as final tiebreak.
    const stencil = tile.stencil5;
    if (!stencil) return;
    const viewer = army.player;
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
        v = (enemy / BONUS <= reachableEnemyOverBonus) ? 1 : 0;
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
