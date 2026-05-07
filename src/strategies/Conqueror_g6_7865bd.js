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

// Conqueror_g5_60c874 went undefeated in season #34. Its thesis was
// to align the 5x5 fallback's selection threshold with tryCommit's
// actual commit gate (enemy <= (sLimit - 0.6) * BONUS), so every
// selected target is one we will commit to. The thesis is right, but
// the implementation has a residual mismatch on mixed-owner tiles:
//
//   - selection scans `enemy = -sumStrength(t.armies, viewer)`, which
//     is the SIGNED net strength (friendlies on the tile subtract).
//   - tryCommit then computes `enemy` as the RAW sum of opponent
//     strengths only, ignoring friendlies on the same tile.
//
// These are the same number on a mono-owner tile -- but tile.armies
// is observed mid-tick (other armies in this same step have already
// attacked into our neighbors, spawning isAttacker armies on those
// tiles). Concretely a tile can hold a friendly defender plus a
// hostile attacker simultaneously when this army's act() runs. On
// such a tile the parent's selection sees `net = enemy - friendly`,
// passes the gate at a too-low threshold, picks the cell, and
// tryCommit then rejects on the raw `enemy` -- the exact idle bug
// the parent's threshold alignment was meant to fix, just resurfaced
// at a different level.
//
// Replacing -sumStrength(...) with a direct opponent-only sum closes
// this last gap: selection and commit now use the same measurement
// in all cases, mono- or mixed-owner. When a mixed neighbor would
// have been picked-and-rejected before, we now skip it correctly,
// and a different truly-committable distance-2 target gets the
// closest-first race.
//
// Everything else is identical: same hasAdjacentTarget short-circuit
// to Conqueror.act, same primary/secondary axis routing, same
// closest-first ordering with weakest as tiebreak, same tryCommit,
// same tech.
export default {
  name: "Conqueror_g6_7865bd",
  author: "claude",
  version: 1,
  description: "Conqueror_g5 with raw opponent-only enemy in the 5x5 selection (matches tryCommit on mixed-owner tiles).",
  summary: `Parent Conqueror_g5_60c874 dominated season #34. Its
contribution was aligning the 5x5 fallback's selection threshold with
tryCommit's actual commit gate, on the premise that every selected
target should be one tryCommit will fire on.

The threshold alignment is correct, but the parent measures enemy
strength differently in the two places: selection uses
-sumStrength(t.armies, viewer), which is net (friendlies subtract);
tryCommit uses a raw sum of opponent armies only (friendlies on the
target don't reduce the enemy stack we have to break). On a
mono-owner tile these match. On a mixed-owner tile -- which exists
mid-tick whenever a prior army in the same step attacked a neighbor
of ours, spawning a hostile isAttacker into a tile our friend already
holds -- the net enemy is smaller than the raw enemy. Selection then
under-counts, accepts a target the gate would otherwise reject, and
tryCommit refuses on actual attempt. The same idle-tick failure mode
the parent's fix was supposed to eliminate, surviving at a different
level.

This descendant replaces -sumStrength with an inline opponent-only
sum, so the threshold check uses the exact value tryCommit will use
in all cases. Mixed-tile borderline picks no longer hijack the
closest-first race; when there is another genuinely committable
distance-2 enemy, it now gets considered.

Conqueror.act delegation, axis routing, ordering, tryCommit logic,
BONUS, and tech are all unchanged.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;

    // Defer to Conqueror whenever any adjacent move is viable: free
    // kill, empty grab, or a friendly with room to be balanced toward.
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

    // Stalled - look 2 deep for a beatable enemy. Closest-first
    // (weakest as tiebreak), with the selection enemy measured as
    // raw opponent strength so the gate matches tryCommit exactly --
    // see header comment.
    if (!tile.stencil5 || sLimit <= 0.5) return;
    const stencil = tile.stencil5;
    const maxEnemy = (sLimit - 0.6) * BONUS;
    if (maxEnemy <= 0) return;

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
    if (bestPrim < 0) return;

    const primaryTarget = neighbors[bestPrim];
    if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
    if (bestSec < 0) return;
    const secondaryTarget = neighbors[bestSec];
    if (secondaryTarget) tryCommit(army, secondaryTarget, sLimit, pid);
  },
};
