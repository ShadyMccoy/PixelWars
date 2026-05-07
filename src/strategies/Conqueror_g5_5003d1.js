import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Stencil5 cell -> [primary dir, secondary dir]. Primary is the
// dominant-axis step (W=0, E=1, N=2, S=3); secondary is the off-axis
// step (or -1 if the cell sits on one axis). The secondary lets the
// fallback retry the off-axis neighbor when the primary one is full.
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

// Parent Conqueror_g4_b6afb7 traded 10 move points (90 -> 80,
// garrison 0.6 -> 0.7) for 10 atk points (4 -> 14) and lost head-to-
// head to all three move:90 Conqueror cousins (g4_868391 closest-
// first, g3_c24a38 3-pass, the latter twice in season #12). The
// atk:14 thesis - "tilt seam math" - underperformed the proven
// {move:90, atk:4} baseline empirically: the 0.1-strength garrison
// tax per push compounds across long matches faster than the atk
// multiplier ever breaks a seam. The two stall losses to Stalker
// variants (seeds 59, 75 at 4000 ticks) reinforce this: when the
// match drags, throughput beats nominal hitting power.
//
// This descendant unifies the two winning improvement paths under
// the proven tech vector:
//
//   - Tech reverts to {move:90, stack:0, prod:2, atk:4, def:4} - the
//     GA optimum shared by every winning Conqueror cousin.
//
//   - 3-pass structure from g3_c24a38: Pass 1 explicitly picks the
//     STRONGEST beatable adjacent enemy (better than Conqueror.act's
//     default kill priority - kills the biggest threat first while
//     it's still in range); Pass 2 defers to Conqueror.act for
//     empty-grab and friendly-balance; Pass 3 falls through to the
//     5x5 stencil when fully stalled.
//
//   - Closest-first comparator from g4_868391 in Pass 3 (weakness as
//     tiebreak instead of the parent's weakest-first / distance-as-
//     tiebreak). On lab1 with maxArmy=6, beatable enemies cluster
//     near the cap so distinct strengths almost never tie - distance
//     is dead weight as a tiebreak. Closest-first puts the army back
//     into adjacent-mode (Conqueror.act) one tick sooner on average.
//
// No new heuristics introduced; just the strict best-of-both of the
// two cousins that beat the parent, on the tech that beat the parent.
export default {
  name: "Conqueror_g5_5003d1",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 with reverted move:90 tech, strongest-first adjacent kill, and closest-first 5x5 fallback.",
  summary: `Parent Conqueror_g4_b6afb7 traded move:90 -> move:80
(garrison 0.6 -> 0.7) for atk:4 -> atk:14, betting that a higher
atk multiplier would break near-parity seams. Empirically it lost:
the parent dropped head-to-head to all three move:90 Conqueror
cousins (g4_868391, g3_c24a38 twice) plus two max-tick Stalker
stalls in season #12. Throughput beat nominal hitting power.

This descendant takes the best of both winning siblings on the
proven tech vector. Tech reverts to {move:90, stack:0, prod:2,
atk:4, def:4}. Behavior is g3_c24a38's 3-pass structure (explicit
strongest-first adjacent kill, then Conqueror.act for empty-grab/
friendly-balance, then 5x5 stalemate fallback) with g4_868391's
closest-first comparator in the stencil pass. On a maxArmy=6 wrap
map distinct enemy strengths almost never tie, so closest-first
dominates the parent's weakest-first by getting the army back into
adjacent-mode one tick sooner per stall.`,
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

    // Pass 1: strongest beatable adjacent enemy (g3_c24a38 priority).
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
