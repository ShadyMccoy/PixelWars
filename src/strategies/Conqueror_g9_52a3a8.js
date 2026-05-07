import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Kill safety buffer above pure parity. Parent g8_74e11b used 0.6
// (hardcoded). Conqueror_g6_9eb2e4, which beat the parent in season
// #75, runs 0.5 — and its rationale still holds: attack resolution
// fires before growth in the same tick, so the enemy snapshot we
// read equals the strength we resolve against. The only remaining
// uncertainty is float precision (~1e-4), and 0.5 is ~5000x that.
const BUFFER = 0.5;

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
    const needed = enemy / BONUS + BUFFER;
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

// Parent Conqueror_g8_74e11b lost in season #75 to Conqueror_g6_9eb2e4
// (and the parent finished last of 6). The two bots are nearly
// identical except for two things:
//
//   1) g6 uses BUFFER = 0.5 in both the Pass 1 adjacent-kill calc
//      and tryCommit's stencil-direction kill calc. The parent
//      hardcodes 0.6 in both places.
//   2) g6 uses raw-strength Pass 1 with a *single-key* Pass 3
//      (closest-first, weakness as tiebreak, reachability gate
//      enemy/BONUS <= sLimit + 0.5). The parent uses raw-strength
//      Pass 1 with a *three-key* Pass 3 (distance, then 4-level
//      path-clear, then weakness, with reachability gate
//      enemy/BONUS <= sLimit - 0.6).
//
// Of those two structural differences, only #1 is broadly favored
// by the prior cousin lineage: g6's predecessor inherited the
// tighter buffer from its own parent and won. The Pass 3 shape in
// the parent (g8) is the merge of two independently-winning ideas
// from g7_0cfdd6 and g4_3fd4ce, so I keep the parent's Pass 3
// chassis intact and adopt only the buffer change from the bot
// that beat it. This makes the descendant the natural merge:
//
//   - Pass 1: raw enemy strength (parent + g6, unchanged here).
//   - Pass 3: distance / 4-level path-clear / weakness, with the
//     reachability gate matching tryCommit's commit margin (now
//     enemy/BONUS <= sLimit - 0.5, since the buffer dropped to 0.5).
//   - BUFFER = 0.5 everywhere (matches g6, saves 0.1 strength per
//     committed kill, leaves more in the garrison for Conqueror.act
//     to spend on empty-grab and friendly-balance next tick).
//
// The buffer cut is dominantly upside: 0.5 still leaves three
// orders of magnitude of float-precision slack, and every kill
// near the feasibility edge becomes feasible one tick earlier.
//
// Tech is unchanged at {move:90, stack:0, prod:2, atk:4, def:4},
// the shared optimum across the winning Conqueror cousin lineage.
export default {
  name: "Conqueror_g9_52a3a8",
  author: "claude",
  version: 1,
  description: "Conqueror_g8 with kill buffer tightened from 0.6 to 0.5 (matching the bot that beat it, Conqueror_g6_9eb2e4).",
  summary: `Parent Conqueror_g8_74e11b finished #6 of 6 in season #75,
losing to Conqueror_g6_9eb2e4. The two are nearly identical except
g6 uses a 0.5 kill safety buffer everywhere while the parent
hardcodes 0.6. g6's tighter buffer is the only structural
difference favored by the broader winning lineage — its Pass 3
chassis is simpler than the parent's, but the parent's three-key
Pass 3 (distance / 4-level path-clear / weakness) merges two
independently-winning ideas (g7_0cfdd6's path-clear and
g4_3fd4ce's tightened reachability gate) so I keep that chassis
intact.

Single targeted change: BUFFER 0.6 -> 0.5, in both Pass 1 and
tryCommit. Pass 3's reachability gate also slides from
sLimit - 0.6 to sLimit - 0.5 so it continues to match tryCommit's
commit margin exactly. Attack resolution fires before growth in
the same tick, so the enemy snapshot equals the strength we
resolve against; 0.5 still leaves ~5000x float-precision slack.

Two effects, both small but cumulative: kills near the feasibility
edge land one tick earlier, and every committed kill leaves 0.1
more strength in the garrison to fund Conqueror.act's empty-grab
and friendly-balance on the next tick.

Tech, sizing, the path-clear cache, DIR_HINTS, and the 3-pass
chassis (Conqueror.act for empty/balance, full stalemate fallback)
are unchanged from the parent.`,
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
        const needed = enemy / BONUS + BUFFER;
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
    // threshold matches tryCommit's commit margin exactly (now 0.5).
    const stencil = tile.stencil5;
    if (!stencil) return;
    const viewer = army.player;
    // tryCommit needs `enemy/BONUS + BUFFER <= sLimit`, i.e.
    // enemy/BONUS <= sLimit - BUFFER to actually fire.
    const reachableEnemyOverBonus = sLimit - BUFFER;

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
