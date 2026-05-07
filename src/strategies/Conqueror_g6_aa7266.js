import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

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

// Parent Conqueror_g5_5003d1 dominated season #17 (no recorded
// losses) with the proven {move:90, stack:0, prod:2, atk:4, def:4}
// tech and a 3-pass kernel: strongest-first adjacent kill, then
// Conqueror.act, then a 5x5 closest-first stalemate fallback.
//
// The one residual inefficiency in the parent's Pass 3 is that
// closest-first picks a stencil target purely on Manhattan distance
// (with weakness as a tiebreak). The cardinal step it then takes
// (primary direction from DIR_HINTS) can land on a tile that is
// itself currently blocked - a strong enemy that exceeds sLimit, or
// a maxed friendly that won't accept reinforcement. tryCommit will
// fall through to the secondary axis, but if that's also blocked the
// turn stalls. Worst case the bot picks a "closest" target whose
// only viable approach is the secondary axis, when an equidistant
// target with a clean primary axis was sitting right there.
//
// This descendant adds one tiebreaker to Pass 3 between distance and
// weakness: prefer stencil targets whose primary cardinal neighbor
// is currently passable (empty, friendly with room, or a beatable
// enemy). Same distance, same selection rule on weakness as a final
// tiebreak - the only difference is that among equally-close stencil
// candidates we route through the lane that's actually open this
// tick, converting more stencil "intentions" into real motion.
//
// No tech change: {move:90, stack:0, prod:2, atk:4, def:4} is the
// shared optimum across the winning Conqueror cousin lineage and the
// parent's runaway season #17 result is the strongest signal yet
// that this allocation is the right anchor.
export default {
  name: "Conqueror_g6_aa7266",
  author: "claude",
  version: 1,
  description: "Conqueror_g5 with a path-clear tiebreak in the 5x5 stalemate fallback.",
  summary: `Parent Conqueror_g5_5003d1 went undefeated in season #17
on the proven {move:90, stack:0, prod:2, atk:4, def:4} tech and a
3-pass kernel (strongest-first adjacent kill -> Conqueror.act ->
closest-first 5x5 fallback). With no losses to learn from, the
improvement target shifts to residual inefficiency in Pass 3.

The parent's Pass 3 picks the closest beatable stencil enemy, then
takes a single cardinal step toward it (primary axis from a fixed
DIR_HINTS table). When the primary neighbor is itself blocked - a
strong adjacent enemy or a maxed friendly - tryCommit falls through
to the secondary axis, and if that's also blocked the army stalls.
Closest-first can pick an equidistant stencil target whose only
viable lane is the secondary axis when a sibling target with a clean
primary axis is sitting right next to it.

This descendant inserts a single tiebreaker between distance and
weakness: among equally-close beatable stencil targets, prefer the
one whose primary cardinal neighbor is currently passable (empty,
friendly with refill room, or beatable enemy). Distance and weakness
selection rules are unchanged otherwise. The change converts more
stencil intent into actual one-tick motion during stalemates,
without altering the winning thesis on tech, kill priority, or
adjacent-mode handling.`,
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

    // Pass 1: strongest beatable adjacent enemy.
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

    // Pass 3: full stalemate. 5x5 with distance-first, path-clear
    // tiebreak, weakness as final tiebreak.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    // Cache neighbor passability for the four cardinal directions:
    //   1  = passable (empty, friendly with room, or beatable enemy)
    //   0  = blocked (no neighbor, strong enemy, or full friendly)
    // Computed lazily because most ticks the stencil pass exits early.
    const passCache = [-1, -1, -1, -1];
    const isPassable = (dir) => {
      let v = passCache[dir];
      if (v >= 0) return v;
      const n = neighbors[dir];
      if (!n) { passCache[dir] = 0; return 0; }
      const armies = n.armies;
      if (armies.length === 0) { passCache[dir] = 1; return 1; }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (enemy > 0) {
        v = (enemy / BONUS <= sLimit + 0.5) ? 1 : 0;
      } else if (friendlyArmy) {
        v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
      } else {
        v = 1;
      }
      passCache[dir] = v;
      return v;
    };

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestClear = -1;
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
      const clear = isPassable(hints[0]);
      if (
        dist < bestDist
        || (dist === bestDist && clear > bestClear)
        || (dist === bestDist && clear === bestClear && enemy < bestWeak)
      ) {
        bestDist = dist;
        bestClear = clear;
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
