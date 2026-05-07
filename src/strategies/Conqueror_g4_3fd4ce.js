import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Stencil5 cell -> [primary dir, secondary dir]. Primary is the
// dominant-axis step (W=0, E=1, N=2, S=3); secondary is the off-axis
// step (or -1 if the cell sits exactly on one axis).
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

// Parent Conqueror_g3_c24a38 dominated season #27 with the unified
// 3-pass kernel (kill -> Conqueror.act -> 2-step stencil fallback) on
// move:90 tech. No recorded losses, so the chassis is solid.
//
// One soft spot remains in Pass 3: the stencil5 fallback picks the
// *weakest* beatable enemy in the 5x5 neighborhood and tiebreaks on
// distance. That biases the move toward distant cleanup targets even
// when a nearer beatable enemy is available, and it accepts targets
// at the permissive `enemy/BONUS <= sLimit + 0.5` threshold while the
// committed step uses the tighter `+0.6` margin - meaning we
// occasionally pick a target whose primary step's tryCommit will
// fail (then secondary fails too) and the army stalls anyway.
//
// This descendant changes two things in Pass 3 only:
//   1) Tie-break order flips to closest-first, weakest-second. In a
//      stalemate fallback the win condition is "engage now"; a dist=2
//      enemy beats a dist=4 enemy regardless of strength, because
//      closer engagement converts to actual movement faster and
//      reduces the re-stall risk on the next tick.
//   2) Threshold tightens from `sLimit + 0.5` to `sLimit - 0.6`, the
//      same margin tryCommit will use. Targets we can't actually
//      reach with a kill no longer crowd out targets we can.
//
// Pass 1, Pass 2, and tech are unchanged - the parent's chassis won
// its season; only the fallback selection is touched.
export default {
  name: "Conqueror_g4_3fd4ce",
  author: "claude",
  version: 1,
  description: "Conqueror_g3 with closest-first Pass 3 fallback and matched commit threshold.",
  summary: `Parent dominated season #27 with no recorded losses on the
3-pass {kill, Conqueror.act, 2-step stencil} kernel and move:90 tech.
The chassis is good; the only soft spot is Pass 3's selection logic.

Pass 3 currently picks the weakest beatable enemy in the 5x5 stencil
and tiebreaks on distance. Two issues compound: (a) a dist=4 weak
enemy out-prioritizes a dist=2 medium enemy even though closer
engagement is the whole point of breaking a stalemate, and (b) the
target-feasibility threshold (sLimit + 0.5) is looser than the
threshold tryCommit will actually enforce on the step's neighbor
(sLimit - 0.6 implicit via 'needed > sLimit'), so we occasionally
pick a target that can't be reached and stall anyway.

This descendant flips Pass 3's primary sort to distance (closest
first, weakest as tiebreaker) and tightens the eligibility threshold
to match tryCommit's commit margin. The result is a stalemate
fallback that engages the nearest reachable enemy instead of
wandering toward distant weak targets.`,
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

    // Pass 1: strongest beatable adjacent enemy (g4-style kill prio).
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

    // Pass 2: any other adjacent action viable -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. Look 2 deep for the closest beatable
    // enemy (tiebreak weakest) and step toward it. Threshold matches
    // tryCommit's commit margin so unreachable targets don't crowd
    // reachable ones.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    // Match tryCommit: needed = enemy/BONUS + 0.6 must be <= sLimit,
    // so enemy/BONUS <= sLimit - 0.6 is the actually-reachable bound.
    const reachableEnemyOverBonus = sLimit - 0.6;

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
      if (enemy / BONUS > reachableEnemyOverBonus) continue;
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
