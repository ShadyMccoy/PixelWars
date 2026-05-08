import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// One-knob nudge from parent g4_3fd4ce: MARGIN 0.6 -> 0.4.
//
// Parent g4_3fd4ce lost season #103 seed=10 finishing #3 of 6, with
// Conqueror_g8_838926 winning. Comparing the two kernels, the
// substantive numerical diff is a single constant: MARGIN in the
// kill threshold. g8_838926's own commentary explicitly credits this
// one change (originally validated by Conqueror_g9_c703a2 beating
// g7_d17330) as the win driver - widening the killable band by
// 0.2 strength on every cardinal evaluation. Survivor strength after
// the kill is 0.4 * 1.4 = 0.56, still above the kernel's 0.5
// positive-ownership floor, so flip-back exposure stays bounded.
//
// This descendant ports that one constant onto the parent's chassis
// without adopting g8's other features (RETAKE_W backup penalty,
// FRIENDLY_W reward, RETAKE_VETO, walk-all-candidates Pass 3). Those
// are a different scoring philosophy than the parent's strongest-
// beatable Pass 1 + closest-first Pass 3; mixing them collapses the
// attribution. By isolating the MARGIN change, the season delta is
// cleanly readable: same Pass 1, same Pass 3 closest-first selection,
// same tech, just the kill threshold widened by 0.2.
//
// Three sites must move together: tryCommit's commit margin, Pass 1's
// needed calc, and Pass 3's reachable bound (sLimit - MARGIN).
const MARGIN = 0.4;

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

export default {
  name: "Conqueror_g5_4ca8e8",
  author: "claude",
  version: 1,
  description: "Conqueror_g4_3fd4ce with MARGIN 0.6 -> 0.4 (the validated kill-threshold widening from g8_838926, who beat the parent in season #103).",
  summary: `Parent g4_3fd4ce finished #3 in season #103 seed=10 to
Conqueror_g8_838926. The two kernels differ in several places, but
g8's commentary explicitly attributes its win to a single constant:
MARGIN 0.6 -> 0.4 in the kill threshold. Lowering MARGIN widens the
killable band by 0.2 strength per cardinal eval; survivor is
0.4 * 1.4 = 0.56, still above the 0.5 positive-ownership floor, so
flip-back exposure stays bounded.

This descendant ports that single constant onto the parent's chassis
without mixing in g8's RETAKE_W/FRIENDLY_W backup scoring or
walk-all-candidates Pass 3 (different scoring philosophy - would
collapse attribution). Pass 1 keeps the strongest-beatable kill
selection; Pass 3 keeps the closest-first stencil fallback with
matched commit margin (now sLimit - 0.4 instead of sLimit - 0.6).

Tech unchanged at 90/0/2/4/4 - the lineage shared optimum.`,
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

    // Pass 1: strongest beatable adjacent enemy (MARGIN tightened).
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
        const needed = enemy / BONUS + MARGIN;
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

    // Pass 3: full stalemate. Closest-first stencil5 fallback with
    // threshold matched to tryCommit's (now widened) commit margin.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const reachableEnemyOverBonus = sLimit - MARGIN;

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
