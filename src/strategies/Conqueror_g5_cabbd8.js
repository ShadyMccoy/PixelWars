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

// Parent Conqueror_g4_868391 finished bottom-half in 3 of 5 recent
// losses, including a max-tick stall vs Crusader_g1_352d0a (4000
// ticks, seed=74). Two distinct relatives that beat the parent
// (Conqueror_g4_1f6790 and Conqueror_g5_71ab3f) both share one
// patch the parent is missing: a strongest-beatable-adjacent-enemy
// priority kill *before* deferring to Conqueror's alignment kernel.
//
// The hole: Conqueror.act sorts directions by alignment kernel
// score, not by enemy presence. A beatable adjacent enemy sitting
// in a low-alignment direction can lose priority to a friendly-
// balance in a higher-alignment one, leaving the threat to grow
// for another tick. That's the same Membrane-pressure failure mode
// g4_1f6790's thesis called out, and it's exactly what
// Crusader_g1_352d0a (which beat us) is designed to exploit:
// Crusader's whole identity is "kill strongest winnable adjacent
// enemy first." If the parent had that priority, the seed=74 stall
// almost certainly resolves in our favor or in a draw won on
// territory rather than max-ticks.
//
// This descendant grafts that priority onto the parent verbatim
// (minimum-overkill sizing, not Crusader's all-in commit, to keep
// the move-heavy 90/0/2/4/4 reserve intact) and keeps the parent's
// distinguishing closest-first 5x5 fallback for stalled positions.
// Net change vs parent: one preceding scan that, when it fires,
// kills a beatable adjacent enemy with minimum overkill instead of
// possibly skipping past it. When it doesn't fire, behavior is
// byte-identical to the parent.
//
// Note this is *not* the same as g5_71ab3f: that bot replaced the
// 5x5 fallback with Stalker_g1_8767f6's weakest-prey-with-growth-bank
// scan. We keep the parent's closest-first fallback (its own thesis
// — get into adjacent-mode one tick sooner) and only add the
// adjacent priority kill. Two separate lineages confirmed that
// patch helps; the closest-first fallback is the parent's own bet
// that hasn't been disconfirmed in head-to-head, only in stalls
// that the new priority kill should itself reduce.
export default {
  name: "Conqueror_g5_cabbd8",
  author: "claude",
  version: 1,
  description: "Conqueror_g4_868391 + strongest-beatable-adjacent-enemy priority kill (Crusader/g4_1f6790 patch).",
  summary: `Parent g4_868391 lost head-to-head to two relatives
(g4_1f6790 and g5_71ab3f) that both add the same patch: kill the
strongest beatable adjacent enemy with minimum overkill before
deferring to Conqueror.act, whose alignment kernel can otherwise
deprioritize a free kill in favor of a friendly-balance in a
higher-aligned direction. Parent also stalled to 4000 ticks vs
Crusader_g1_352d0a, whose entire thesis is exactly this priority.

Graft the patch onto the parent verbatim: minimum-overkill sizing
(not Crusader's all-in) to keep the move-heavy 90/0/2/4/4 reserve
thesis intact; closest-first 5x5 fallback unchanged from the parent
(parent's own bet, undisconfirmed in head-to-head). When the new
priority scan finds nothing, behavior is byte-identical to the
parent. Tech unchanged - 90/0/2/4/4 is still the GA optimum and
both winners over the parent kept it.`,
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

    // Priority kill: strongest beatable adjacent enemy first, with
    // minimum overkill so the surplus stays available next tick.
    let bestTile = null;
    let bestEnemy = -1;
    let bestNeeded = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      let friendly = false;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      const needed = enemy / BONUS + 0.6;
      if (needed > sLimit) continue;
      if (enemy > bestEnemy) {
        bestEnemy = enemy;
        bestTile = t;
        bestNeeded = needed;
      }
    }
    if (bestTile) {
      army.attack(bestTile, bestNeeded);
      return;
    }

    // No beatable adjacent enemy. Check whether any other adjacent
    // move is viable (empty tile or friendly with room). Beatable
    // enemies were already handled above; remaining enemies are
    // unbeatable and skipped here.
    let hasAdjacentTarget = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasAdjacentTarget = true; break; }
      let friendlyArmy = null;
      let hasEnemy = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else hasEnemy = true;
      }
      if (hasEnemy) continue;
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasAdjacentTarget = true;
        break;
      }
    }
    if (hasAdjacentTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Stalled - parent's closest-first 5x5 fallback (weakest as
    // tiebreak). Get into adjacent-mode one tick sooner on average.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestStencilEnemy = Infinity;
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
      if (dist < bestDist || (dist === bestDist && enemy < bestStencilEnemy)) {
        bestDist = dist;
        bestStencilEnemy = enemy;
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
