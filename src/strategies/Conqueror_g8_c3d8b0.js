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

// Last-resort kill on a slightly-too-strong neighbor enemy. The
// strict kill condition from the engine resolution is `sLimit * BONUS
// * atkMult > enemy * defMult`. Mixed neighbors are skipped to avoid
// friendly-fire reasoning. Multi-enemy tiles use the strongest
// defender's defMult as the conservative bound.
function tryNoMarginKill(army, neighbors, sLimit, pid) {
  if (sLimit <= 0.5) return;
  const myMults = army.player.techMults;
  const atkMult = (myMults && myMults.atk) || 1;
  const effBonus = BONUS * atkMult;
  let best = null;
  let bestEnemy = Infinity;
  for (let i = 0; i < 4; i++) {
    const t = neighbors[i];
    if (!t) continue;
    const tArmies = t.armies;
    if (tArmies.length === 0) continue;
    let enemy = 0;
    let mixed = false;
    let maxDef = 1;
    for (let k = 0; k < tArmies.length; k++) {
      const a = tArmies[k];
      if (a.player.id === pid) {
        mixed = true;
        continue;
      }
      enemy += a.strength;
      const dm = (a.player.techMults && a.player.techMults.def) || 1;
      if (dm > maxDef) maxDef = dm;
    }
    if (enemy <= 0) continue;
    if (mixed) continue;
    const killCeiling = (sLimit * effBonus) / maxDef - 0.05;
    if (enemy >= killCeiling) continue;
    if (enemy < bestEnemy) {
      bestEnemy = enemy;
      best = t;
    }
  }
  if (best) army.attack(best, sLimit);
}

// Parent Conqueror_g7_3f7da6 added a no-margin kill safety net for
// stalled standoffs and dominated season #83. The kill window is
// gated by atk: the strict kill threshold is `sLimit * BONUS *
// atkMult > enemy * defMult`. The parent's tech sets atk=4 (well
// below the tech=20 baseline), so atkMult is suppressed and the
// killCeiling = (sLimit * BONUS * atkMult) / maxDef - 0.05 is
// narrower than it could be. Borderline-too-strong enemies that
// would have flipped a tile are still skipped because effBonus
// shrinks under low atkMult.
//
// This descendant shifts 5 tech points from move (90 -> 85) into
// atk (4 -> 9). The garrison-floor change is microscopic --
// `1.5 - 0.005*85 = 1.075` vs the parent's `1.05`, a +0.025 raw
// increase that costs ~0.025 of attackPower at maxStrength. In
// exchange, atk moves closer to baseline, widening the kill window
// in tryNoMarginKill so more stalled-standoff neighbors are flipped
// each tick instead of idled past. The Conqueror.act delegation,
// hasAdjacentTarget short-circuit, the 5x5 stencil routing, and the
// no-margin kill logic are unchanged. Stack/prod/def are unchanged.
//
// The 5x5 routing remains a structural no-op (the parent's comment
// explains: it only fires when every neighbor is a too-strong enemy
// or full friendly, and tryCommit refuses both, so the path through
// the primary/secondary neighbor never commits). It is preserved
// verbatim as a safety net in case that analysis missed an edge case.
export default {
  name: "Conqueror_g8_c3d8b0",
  author: "claude",
  version: 1,
  description: "Conqueror_g7 with 5 tech points shifted from move into atk to widen the no-margin kill window.",
  summary: `Parent Conqueror_g7_3f7da6 dominated season #83 and its
key innovation -- a no-margin kill safety net for stalled standoffs
-- is gated on atk: the kill ceiling is (sLimit * BONUS * atkMult) /
maxDef. With the parent's atk=4 (well below the tech=20 baseline),
atkMult is suppressed and borderline kills get refused.

This descendant shifts 5 points from move (90 -> 85) into atk (4 ->
9). The garrison change is microscopic (1.075 vs 1.05, a 0.025 raw
floor bump that costs ~0.025 of attackPower at full strength). In
exchange, atk moves closer to baseline, widening the kill ceiling so
more stalled neighbors fall into the killable window each tick. The
intent is small-and-targeted: more no-margin kills succeed without
disturbing the parts of the strategy that already win.

Conqueror.act delegation, the hasAdjacentTarget short-circuit, the
5x5 stencil routing, the no-margin kill logic itself, and the
stack/prod/def allocations are all unchanged.`,
  tech: { move: 85, stack: 0, prod: 2, atk: 9, def: 4 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;

    let hasAdjacentTarget = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasAdjacentTarget = true; break; }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (enemy > 0) {
        const needed = enemy / BONUS + 0.6;
        if (needed <= sLimit) { hasAdjacentTarget = true; break; }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasAdjacentTarget = true;
        break;
      }
    }
    if (hasAdjacentTarget) {
      Conqueror.act(army, game);
      return;
    }

    if (!tile.stencil5 || sLimit <= 0.5) {
      tryNoMarginKill(army, neighbors, sLimit, pid);
      return;
    }
    const stencil = tile.stencil5;
    const maxEnemy = (sLimit - 0.6) * BONUS;
    if (maxEnemy <= 0) {
      tryNoMarginKill(army, neighbors, sLimit, pid);
      return;
    }

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestEnemy = Infinity;
    for (let i = 0; i < 25; i++) {
      const hints = DIR_HINTS[i];
      if (hints[0] < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const tArmies = t.armies;
      let enemy = 0;
      for (let k = 0; k < tArmies.length; k++) {
        const a = tArmies[k];
        if (a.player.id !== pid) enemy += a.strength;
      }
      if (enemy <= 0) continue;
      if (enemy > maxEnemy) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      if (dist < bestDist || (dist === bestDist && enemy < bestEnemy)) {
        bestDist = dist;
        bestEnemy = enemy;
        bestPrim = hints[0];
        bestSec = hints[1];
      }
    }

    if (bestPrim >= 0) {
      const primaryTarget = neighbors[bestPrim];
      if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
      if (bestSec >= 0) {
        const secondaryTarget = neighbors[bestSec];
        if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
      }
    }

    tryNoMarginKill(army, neighbors, sLimit, pid);
  },
};
