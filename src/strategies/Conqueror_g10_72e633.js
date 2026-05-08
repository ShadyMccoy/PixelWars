import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Single-knob change vs parent g9_65e80c: MARGIN 0.6 -> 0.5.
//
// Parent dominated season #118 with no recorded losses, so there is
// no specific failure mode to attack. The cleanest small tuning is
// the safety buffer that gates every attack:
//
//   needed = enemy / BONUS + MARGIN
//
// Parent commits 0.6 strength of cushion above break-even on every
// kill. With BONUS=1.4 the per-defender break-even is already
// generous (a 1.0-strength enemy needs ~0.71 to crack), so the
// extra 0.6 buffer is nearly half the strict break-even on small
// fights. Trimming MARGIN to 0.5 keeps a comfortable cushion
// (still ~70% margin over break-even on a 1.0-strength target)
// while leaving an extra 0.1 strength sitting in the attacker's
// garrison after every kill.
//
// On lab1 (30x22, growth 1.8) that 0.1/attack pools up: more
// strength left behind means stronger Pass-1 backing-stencils on
// subsequent turns, slightly faster compounding. Parent already
// wins the open field, so the regression risk is bounded — at most
// a handful of marginal close-calls become 50/50 instead of safe.
// Pass 3's `enemy / BONUS <= sLimit + 0.5` passability check is
// untouched (it uses its own +0.5 slack, independent of MARGIN),
// so route reasoning is unchanged.
//
// Everything else (hemisphere-weighted Pass 1, path-clear Pass 3,
// BACKING_WEIGHT=0.4, tech {90/0/2/4/4}) is byte-for-byte parent.
const MARGIN = 0.5;
const BACKING_WEIGHT = 0.4;

const HEMI = (() => {
  const w = [], e = [], n = [], s = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const idx = i * 5 + j;
      const dx = j - 2;
      const dy = i - 2;
      if (dx < 0) w.push(idx);
      if (dx > 0) e.push(idx);
      if (dy < 0) n.push(idx);
      if (dy > 0) s.push(idx);
    }
  }
  return [w, e, n, s];
})();

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

export default {
  name: "Conqueror_g10_72e633",
  author: "claude",
  version: 1,
  description: "Parent g9_65e80c with MARGIN trimmed 0.6 -> 0.5: same attack discipline, ~0.1 strength/attack saved as residual garrison.",
  summary: `Parent Conqueror_g9_65e80c had no losses to learn from in
season #118, so this descendant tunes the only knob that touches
literally every attack: the safety buffer MARGIN.

Single change: MARGIN 0.6 -> 0.5. The needed-strength formula
\`enemy / BONUS + MARGIN\` (with BONUS=1.4) already gives a ~30%
break-even discount per defender; parent stacks another 0.6 on
top as cushion. Trimming to 0.5 keeps the cushion meaningful
while leaving 0.1 extra strength in the attacker's garrison after
every successful kill. On lab1 (growth 1.8, maxArmy 12), that
residue accumulates into stronger Pass-1 backing-stencil scores
on subsequent turns and faster compounding overall.

Pass 3's own +0.5 passability slack is independent of MARGIN, so
route reasoning is unchanged. Hemisphere-weighted Pass 1, path-
clear Pass 3, BACKING_WEIGHT=0.4, and tech {move:90, stack:0,
prod:2, atk:4, def:4} are byte-for-byte parent.

Expected effect: a small efficiency uplift in fights parent already
wins. Regression risk is small and well-bounded — at most a few
marginal attacks that previously had 0.6 cushion now have 0.5
cushion, so close-call dice rolls shift fractionally. If this
descendant underperforms, the takeaway is that parent's MARGIN was
correctly tuned and the next iteration should explore a different
axis (BACKING_WEIGHT, prod tech, or a Pass-1 friendly-discount).`,
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
    const stencil = tile.stencil5;
    const viewer = army.player;

    // Pass 1: hemisphere-weighted adjacent kill picker.
    let bestTile = null;
    let bestScore = -1;
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
        const needed = enemy / BONUS + MARGIN;
        if (needed > sLimit) continue;

        let backing = 0;
        if (stencil) {
          const idxs = HEMI[i];
          for (let k = 0; k < idxs.length; k++) {
            const cell = stencil[idxs[k]];
            if (!cell) continue;
            const cArmies = cell.armies;
            if (cArmies.length === 0) continue;
            const e = -sumStrength(cArmies, viewer);
            if (e > 0) backing += e;
          }
        }
        const score = enemy + BACKING_WEIGHT * backing;
        if (score > bestScore) {
          bestScore = score;
          bestTile = t;
          bestNeeded = needed;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }
    if (bestTile) {
      army.attack(bestTile, bestNeeded);
      return;
    }

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 stencil with distance-first,
    // path-clear tiebreak, weakness as final tiebreak.
    if (!stencil) return;

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
