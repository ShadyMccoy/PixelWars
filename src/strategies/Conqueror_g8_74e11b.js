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

// Parent Conqueror_g7_31769b lost in season #70 to two Conqueror
// cousins, and both winners share traits the parent rejected:
//
//   1) Conqueror_g7_0cfdd6 uses raw-strength Pass 1 (no hemisphere
//      weighting) and a 4-level path-clear score in Pass 3
//      (clear = primary*2 + secondary, range 0..3) so secondary-only
//      stencil candidates outrank fully-blocked ones.
//   2) Conqueror_g4_3fd4ce uses raw-strength Pass 1 and tightens the
//      Pass 3 reachability threshold from sLimit + 0.5 to sLimit - 0.6
//      so unreachable stencil targets stop crowding out reachable
//      ones (the parent's loose threshold matches tryCommit's commit
//      margin, but tile-level scoring uses a permissive bound).
//
// Both winners agree on dropping the parent's hemisphere-weighted
// Pass 1 in favor of raw enemy strength, and each independently
// improved Pass 3. This descendant takes the natural merge: raw
// Pass 1 + 4-level path-clear (g7_0cfdd6) + tightened reachability
// threshold (g4_3fd4ce). Distance is still the dominant key, clear
// is the second key, weakness is the final tiebreak.
//
// Tech is unchanged at {move:90, stack:0, prod:2, atk:4, def:4}, the
// shared optimum across the winning Conqueror cousin lineage.
export default {
  name: "Conqueror_g8_74e11b",
  author: "claude",
  version: 1,
  description: "Conqueror_g7 minus hemisphere weighting, plus g7_0cfdd6's 4-level path-clear and g4_3fd4ce's tightened Pass 3 threshold.",
  summary: `Parent Conqueror_g7_31769b lost twice in season #70. Both
winners (Conqueror_g7_0cfdd6 and Conqueror_g4_3fd4ce) abandoned the
parent's hemisphere-weighted Pass 1 in favor of raw enemy-strength
selection, and each improved Pass 3 in a different way:

  - g7_0cfdd6 replaced the binary path-clear bit (0/1) with a 4-level
    score: clear = primary_passable * 2 + secondary_passable. That
    distinguishes secondary-only routing from fully blocked, matching
    what tryCommit will actually attempt.
  - g4_3fd4ce tightened the Pass 3 reachability gate from
    enemy/BONUS <= sLimit + 0.5 to sLimit - 0.6, the actual margin
    tryCommit will enforce on the chosen target. Stencil targets that
    can't be killed no longer crowd out targets that can.

This descendant is the merge: raw-strength Pass 1, 4-level path-clear
in Pass 3, AND the tightened threshold. The hemisphere experiment is
dropped — both winners against this parent went without it. Distance
remains the dominant Pass 3 sort key, clear is second, weakness is
the final tiebreak.

Tech, sizing, MARGIN, the path-clear cache, and DIR_HINTS are
unchanged. The behavioral changes vs the parent are all confined to
target selection — the chassis (3-pass kill / Conqueror.act /
stalemate) is unchanged.`,
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

    // Pass 1: strongest beatable adjacent enemy (matches both winners).
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

    // Pass 3: full stalemate. 5x5 with distance-first, 4-level
    // path-clear tiebreak, weakness as final tiebreak. Reachability
    // threshold matches tryCommit's commit margin exactly.
    const stencil = tile.stencil5;
    if (!stencil) return;
    const viewer = army.player;
    // tryCommit needs `enemy/BONUS + 0.6 <= sLimit`, i.e.
    // enemy/BONUS <= sLimit - 0.6 to actually fire.
    const reachableEnemyOverBonus = sLimit - 0.6;

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
        v = (enemy / BONUS <= reachableEnemyOverBonus) ? 1 : 0;
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
      if (enemy / BONUS > reachableEnemyOverBonus) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      const primClear = isPassable(hints[0]);
      const secClear = hints[1] >= 0 ? isPassable(hints[1]) : 0;
      const clear = primClear * 2 + secClear;
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
