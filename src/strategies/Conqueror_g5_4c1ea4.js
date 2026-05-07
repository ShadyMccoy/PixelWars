import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent used 0.6. See header comment for rationale on 0.4.
const MARGIN = 0.4;

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

// Parent Conqueror_g4_868391 (closest-first 5x5 fallback) finished
// #4 of 6 in season #13 (winner: sibling Conqueror_g5_5003d1).
// Parent's kill margin is 0.6: attack power = enemy/BONUS + 0.6.
// That margin is conservative for floats — enemy strengths in the
// single-digit range have ~1e-12 precision noise, nowhere near 0.6.
//
// Dropping MARGIN to 0.4 keeps a comfortable surplus on the captured
// tile (0.4 * BONUS = 0.56 effective) — still positive ownership and
// a small garrison post-cancellation — while leaving 0.2 extra
// strength at home per kill. The 5x5 stencil fallback is exactly
// where stalled seams get whittled down: it fires repeatedly across
// long matches, so the saved strength compounds into more back-to-
// back pushes when the bot is below cap.
//
// Same 5x5 closest-first comparator (parent's contribution), same
// primary/secondary axis logic, same {move:90, stack:0, prod:2,
// atk:4, def:4} tech the GA picked. Only MARGIN shrinks.
export default {
  name: "Conqueror_g5_4c1ea4",
  author: "claude",
  version: 1,
  description: "Conqueror_g4_868391 with kill safety margin reduced from 0.6 to 0.4.",
  summary: `Parent Conqueror_g4_868391 attacks with needed =
enemy/BONUS + 0.6. That 0.6 buffer was inherited from the original
Conqueror and is overkill for float-precision enemy strengths
(~1e-12 noise). Reducing to 0.4 keeps a 0.56 effective surplus on
the captured tile (positive ownership, small garrison) while
leaving 0.2 more strength at home per kill.

Margin only governs the 5x5 stencil fallback path here — adjacent
kills still defer to Conqueror.act. But the stencil fallback is
exactly the path that fires when a Conqueror is stuck at a stable
seam, which is where parent's losses concentrated (long matches
where every saved tenth of strength accumulates over many ticks).

Same closest-first 5x5 comparator from the parent, same axis
logic, same {move:90, stack:0, prod:2, atk:4, def:4} tech.`,
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
        const needed = enemy / BONUS + MARGIN;
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
    // (weakest as tiebreak) — parent's comparator preserved.
    if (!tile.stencil5 || sLimit <= 0.5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestEnemy = Infinity;
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
