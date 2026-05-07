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

// Parent Conqueror_g4_868391 lost head-to-head to its sibling
// Conqueror_g5_cabbd8 in season #12 (seed=2 lineup, finished #4 of 6
// while g5_cabbd8 won). The validated patch in the winner was a
// strongest-beatable-adjacent-enemy priority kill *before* deferring
// to Conqueror.act, whose alignment kernel can otherwise route the
// army into a friendly-balance in a higher-aligned direction and
// leave a free kill on the table for another tick. The same patch
// independently helped two relatives that beat the parent
// (g4_1f6790 and g5_71ab3f), so the signal is strong: this is the
// hole in the parent.
//
// This descendant grafts that priority-kill onto the parent
// verbatim (minimum-overkill sizing, not Crusader's all-in commit,
// to keep the move-heavy 90/0/2/4/4 reserve thesis intact). My
// distinguishing bet vs g5_cabbd8 is in the stencil5 fallback
// tiebreak: when two beatable enemies sit at the same Manhattan
// distance from us, parent (and g5_cabbd8) prefers the *weakest*.
// I prefer the *strongest* — the rationale is that the closer
// enemy among ties is going to be engaged next tick anyway via
// adjacent-mode, but committing the secondary direction toward
// the heavier of two equidistant targets puts pressure on the
// bigger eventual threat. Distance-first is preserved (parent's
// own thesis: get into adjacent-mode one tick sooner). The 5x5
// scan rarely fires when no adjacent target exists since wrap
// maps mean all neighbors exist and are either unbeatable or
// full-friendly in the stalled state — but when it does, this
// flip costs nothing and biases toward decisive kills.
//
// When the priority-kill scan finds nothing AND no other adjacent
// move is viable AND the 5x5 scan finds nothing, behavior is
// byte-identical to the parent (i.e., return without action).
// Tech unchanged from parent — 90/0/2/4/4 is the GA optimum and
// every winner over the parent kept it.
export default {
  name: "Conqueror_g5_171570",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 + strongest-beatable-adjacent priority kill + strongest-tiebreak 5x5 fallback.",
  summary: `Parent g4_868391 finished #4/6 in season #12, beaten by
sibling g5_cabbd8 whose only patch was a priority kill: strongest
beatable adjacent enemy with minimum overkill before deferring to
Conqueror.act. Two other relatives that beat the parent
(g4_1f6790, g5_71ab3f) ship the same patch — strong signal that
Conqueror's alignment kernel can deprioritize a free adjacent kill
in favor of a friendly-balance step in a higher-aligned direction.

This descendant grafts the priority-kill verbatim and flips one
detail in the parent's stencil5 fallback: ties on Manhattan
distance now break toward the *strongest* beatable enemy, not the
weakest. Closest-first is preserved (parent's own thesis). The
flip biases the secondary commit toward bigger eventual threats
when the 5x5 scan does fire. Minimum-overkill kept on the priority
kill (not Crusader's all-in) to preserve the move-heavy 90/0/2/4/4
reserve. When neither scan finds a target, behavior is byte-
identical to parent.`,
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
    // (g5_cabbd8 / g4_1f6790 / g5_71ab3f patch — validated across
    // three sibling lineages.)
    let killTile = null;
    let killEnemy = -1;
    let killNeeded = 0;
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
      if (enemy > killEnemy) {
        killEnemy = enemy;
        killTile = t;
        killNeeded = needed;
      }
    }
    if (killTile) {
      army.attack(killTile, killNeeded);
      return;
    }

    // No beatable adjacent enemy. Defer to Conqueror.act if any
    // other adjacent move is viable (empty tile or friendly with
    // room — beatable enemies were handled above; remaining
    // enemies are unbeatable and skipped).
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

    // Stalled — closest-first 5x5 fallback with strongest as
    // tiebreak (flipped from parent's weakest tiebreak — see
    // header comment).
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestStencilEnemy = -1;
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
      if (dist < bestDist || (dist === bestDist && enemy > bestStencilEnemy)) {
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
