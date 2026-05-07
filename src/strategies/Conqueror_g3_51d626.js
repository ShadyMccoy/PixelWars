import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Stencil5 cell -> [primary dir, secondary dir]. Primary is the
// dominant-axis step (W=0, E=1, N=2, S=3); secondary is the off-axis
// step (or -1 if the cell sits exactly on one axis). The parent only
// stored the primary axis, so when the primary neighbor was a full
// friendly tile the bot would silently idle. Carrying the secondary
// hint lets the fallback try the other axis before giving up.
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
        // |dx| == |dy| (diagonal); pick horiz primary, vert secondary.
        primary = horiz;
        secondary = vert;
      }
      out[i * 5 + j] = [primary, secondary];
    }
  }
  return out;
})();

// Mirror of the parent's per-target commit logic, factored so we can
// retry a different neighbor when the first attempt is blocked.
// Returns true iff army.attack was issued.
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

// Parent Conqueror_g2_6b59e8 lost in season #5 to:
//   - Membrane_g1_b9f1d5 twice (one max-tick stall at 4000 ticks, one
//     timed loss) - both move-heavy mirrors that out-pressured the
//     parent's interior tiles.
//   - Conqueror_g1_879a88 twice - the simpler ancestor without the
//     5x5 fallback. That's the most damning result: in head-to-heads
//     the fallback is paying complexity cost without consistently
//     producing pushes.
//
// Reading the parent's fallback path: when no adjacent move is
// viable, it picks the weakest beatable enemy in the 5x5 stencil and
// tries to step along its DOMINANT axis. If that neighbor happens to
// be a full friendly (extremely common deep in matches when interior
// tiles cap out), tryCommit returns false and the army idles. That's
// exactly the max-tick stall mode.
//
// This descendant keeps the parent kernel byte-for-byte at the front
// (Conqueror.act on any viable adjacent move) and the same 5x5
// best-prey selection. The change is one bit per stencil cell: a
// secondary axis. When the primary step is blocked, we try the
// off-axis neighbor before giving up. That converts a class of
// stalled ticks into actual movement, without ever attacking
// something the parent wouldn't have. Tech is unchanged.
export default {
  name: "Conqueror_g3_51d626",
  author: "claude",
  version: 1,
  description: "Conqueror_g2 + secondary-axis backup so the 5x5 fallback stops idling on full-friendly primaries.",
  summary: `Conqueror_g2_6b59e8 stalled at max-ticks vs Membrane and
lost head-to-head to its simpler ancestor Conqueror_g1_879a88. The
common thread is the 5x5 fallback: it picks a weakest beatable
enemy two tiles away and steps toward it along the dominant axis
ONLY. When that primary neighbor is a full friendly tile (no room
to balance into) the parent silently returns and the army idles
for that tick - and often the next, and the next.

This descendant keeps the parent's selection logic and tech intact
and just records a secondary axis alongside the primary. If the
primary commit is blocked, we try the off-axis neighbor before
giving up. The bot never attacks anything the parent wouldn't have;
it only converts some idle ticks into the same kind of step the
parent already agrees is correct.`,
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

    // Stalled - look 2 deep for the weakest beatable enemy.
    if (!tile.stencil5 || sLimit <= 0.5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestPrim = -1;
    let bestSec = -1;
    let bestEnemy = Infinity;
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
      if (enemy < bestEnemy || (enemy === bestEnemy && dist < bestDist)) {
        bestEnemy = enemy;
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
