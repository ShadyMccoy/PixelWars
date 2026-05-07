import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Stencil5 cell -> [primary dir, secondary dir]. Primary is the
// dominant-axis step (W=0, E=1, N=2, S=3); secondary is the off-axis
// step (or -1 if the cell sits exactly on one axis). Carrying a
// secondary lets the stalemate fallback try the off-axis neighbor
// when the primary one is full-friendly.
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

// Parent Conqueror_g2_5908df went 0-3 head-to-head against move:90
// siblings (g1_879a88 seed=77, g3_51d626 seed=71, g4_1f6790 seed=79)
// and stalled at max-ticks vs Stalker_g1_8767f6 (seed=59, 4000 ticks).
// Two distinct failure modes:
//   1) The {move:80, stack:0, prod:2, atk:10, def:8} rebalance traded
//      0.1 garrison throughput for atk/def that's still well below the
//      tech-20 baseline (atk:10/-10, def:8/-12). The three move:90
//      variants all run garrison 0.6 and out-pressured the parent's
//      0.7-floor build in head-to-head.
//   2) The kill-priority hot path doesn't help when no adjacent move
//      exists at all - exactly the max-tick stall mode that g3
//      addressed by looking 2 deep with a stencil5 search.
//
// This descendant unions the two improvement paths:
//   - Pass 1: g4-style strongest-beatable-adjacent-enemy kill, with
//     minimum-overkill sizing (enemy/1.4 + 0.6).
//   - Pass 2: defer to Conqueror.act when an empty-grab or
//     friendly-balance neighbor is available.
//   - Pass 3: g3-style 5x5 stencil search for weakest beatable enemy
//     2 steps away with primary+secondary axis fallback - converts
//     idle stall ticks into actual movement.
// Tech reverts to the GA-discovered {move:90, stack:0, prod:2, atk:4,
// def:4}: the parent lost to all three move:90 cousins, so the
// throughput thesis wins over the atk/def reallocation.
export default {
  name: "Conqueror_g3_c24a38",
  author: "claude",
  version: 1,
  description: "Conqueror_g2 with g3-style 2-step stalemate fallback and reverted move:90 tech.",
  summary: `Parent went 0-3 in head-to-head vs the move:90 Conqueror
cousins (g1, g3, g4) and had two max-tick stalls. The atk/def
rebalance away from move:90 cost a strict garrison-throughput
matchup; the lone-pass kill priority left the bot with no answer
when every adjacent neighbor was full-friendly or unbeatable.

Fix: unify the two improvement paths the cousins each got half of.
Keep the parent's strongest-beatable-adjacent kill priority; if no
kill but any other adjacent action is available, defer to
Conqueror.act for kernel-aligned territory logic; if the entire
4-neighborhood is full-friendly or unbeatable, fall through to a
g3-style 5x5 search for the weakest beatable enemy two tiles away
and step toward it on primary axis (or secondary if primary is
full-friendly). Revert tech to {move:90, stack:0, prod:2, atk:4,
def:4} - the GA optimum that all three winning cousins shared.`,
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

    // Pass 3: full stalemate. Look 2 deep for the weakest beatable
    // enemy and step toward it (g3-style), trying off-axis if the
    // primary neighbor is blocked.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestPrim = -1;
    let bestSec = -1;
    let bestWeak = Infinity;
    let bestDist = 0;
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
      if (enemy < bestWeak || (enemy === bestWeak && dist < bestDist)) {
        bestWeak = enemy;
        bestDist = dist;
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
