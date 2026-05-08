import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Lineage trend: g8 BUFFER 0.6 -> g9 0.5 -> g10 0.4 -> g11 0.3, each
// parent dominated its season. Parent g7_3f7da6 forked off this trend
// to add a no-margin kill safety net but stayed at BUFFER=0.6
// implicitly, and lost season #92 to descendants of the lower-BUFFER
// branch (Conqueror_g6_9eb2e4 at BUFFER=0.5 and Conqueror_g11_e13995
// at BUFFER=0.3). Adopting the validated BUFFER=0.3 from the winning
// branch realigns the parent with the dominant trajectory while
// keeping its orthogonal no-margin-kill safety net.
const BUFFER = 0.3;

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

// Last-resort kill on a slightly-too-strong neighbor enemy. tryCommit
// refuses any enemy where `enemy/BONUS + BUFFER > sLimit`. The strict
// kill condition from the engine is `sLimit * BONUS * atkMult >
// enemy * defMult`. The window between tryCommit's threshold and the
// strict-kill threshold contains the WEAKEST "too strong" neighbors:
// a full-sLimit attack does kill them, the survivor is just thin.
// Even with BUFFER tightened to 0.3 the window stays open: the buffer
// is symbolic strength, not the strict-kill margin, so this fallback
// keeps catching cases tryCommit refuses.
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

// Parent g7_3f7da6 introduced a no-margin kill safety net but kept
// BUFFER implicitly at 0.6 (via the +0.6 raw in needed calcs).
// Meanwhile the g6 -> g9 -> g10 -> g11 branch that beat the parent in
// season #92 tightened BUFFER 0.5 -> 0.4 -> 0.3 across three winning
// generations and also adopted a richer 3-pass chassis (strongest-
// first adjacent kill, Conqueror.act for empty/balance, stencil with
// path-clear cache) instead of the parent's "delegate to Conqueror
// whenever any adjacent target exists" short-circuit.
//
// This descendant merges both threads:
//   1. Adopt g11's BUFFER=0.3 in tryCommit and its 3-pass chassis.
//      Strongest-first kill prioritization plus path-clear caching
//      consistently beat the parent's coarser delegation pattern.
//   2. Keep g7's no-margin kill as a 4th-pass safety net AFTER the
//      stencil routing exhausts. The two improvements are orthogonal:
//      the lower BUFFER expands the *committed* kill set, while
//      no-margin kill captures the *strict-kill-feasible* enemies
//      that tryCommit still refuses (any BUFFER value above zero
//      leaves this gap open). Combining them is strictly more
//      action than either alone.
//
// Tech unchanged from the GA-optimum {move:90, stack:0, prod:2,
// atk:4, def:4} that has carried this lineage for 12 generations.
export default {
  name: "Conqueror_g8_529c9b",
  author: "claude",
  version: 1,
  description: "Parent g7's no-margin kill safety net layered on top of g11's BUFFER=0.3 + 3-pass chassis.",
  summary: `Parent Conqueror_g7_3f7da6 forked off the BUFFER-reduction
trend (g6 0.5 -> g9 0.4 -> g10 0.4 -> g11 0.3, every step a clean
winner) to add a no-margin kill safety net while keeping BUFFER=0.6
implicitly. In season #92 the parent finished 5th-or-worse three
times, twice losing to Conqueror_g11_e13995 (BUFFER=0.3) and once
to Conqueror_g6_9eb2e4 (BUFFER=0.5). The two improvement axes are
orthogonal, so the loss is structural: the parent took one win
(safety-net stalemate breaker) and gave up a different proven win
(tighter buffer + smarter routing).

This descendant merges both:
  - Adopt the g11 chassis verbatim: BUFFER=0.3, three passes
    (strongest-first beatable adjacent enemy; Conqueror.act for
    empty-grab and friendly-balance when nothing was killable;
    full-stalemate stencil with distance-first / path-clear /
    weakness tiebreak and reachability gate matching BUFFER).
  - Layer the parent's no-margin kill as a 4th pass that fires
    only when the stencil routing fails to commit. tryCommit
    refuses enemies where enemy/BONUS + 0.3 > sLimit; the strict
    engine kill condition is sLimit * BONUS * atkMult > enemy *
    defMult. The gap between those still exists at BUFFER=0.3 (the
    buffer is symbolic comfort, not the strict-kill margin), and a
    full-sLimit attack on the weakest enemy in that gap captures
    the tile for a favorable raw trade. Mixed-owner tiles are
    skipped to keep the reasoning local.

Tech unchanged from the GA-optimum {move:90, stack:0, prod:2,
atk:4, def:4}.`,
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

    // Pass 3: full stalemate. 5x5 with distance-first, path-clear,
    // weakness tiebreak. Reachability matches BUFFER exactly.
    const stencil = tile.stencil5;
    if (stencil) {
      const viewer = army.player;
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

      if (bestPrim >= 0) {
        const primaryTarget = neighbors[bestPrim];
        if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
        if (bestSec >= 0) {
          const secondaryTarget = neighbors[bestSec];
          if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
        }
      }
    }

    // Pass 4: no-margin kill safety net (g7 inheritance). Fires only
    // against enemies tryCommit refused but the strict engine kill
    // condition still allows. Mixed-owner tiles are skipped.
    tryNoMarginKill(army, neighbors, sLimit, pid);
  },
};
