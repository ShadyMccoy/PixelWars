import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const BACKING_WEIGHT = 0.5;

// Parent g6_27c4e7 lost season #118 to (among others)
// Conqueror_g9_d2499d and Conqueror_g9_192ea5. Both winners share
// exactly one structurally simple edge over the parent: MARGIN
// tightened from 0.6 to 0.45 in the kill-cost formula
//   needed = enemy / BONUS + MARGIN
// applied consistently to Pass 1 eligibility, tryCommit, and the
// Pass 3 reachability bound. The reasoning carries over verbatim:
// every fight where attackPower lands in
//   [enemy/1.4 + 0.45, enemy/1.4 + 0.6)
// becomes an actual kill instead of a stall, and 0.15 more
// strength stays home on every successful kill (the compounding
// benefit the Conqueror lineage is built around). 0.45 still
// absorbs sub-0.1 float jitter and a small mid-tick reinforcement;
// only a coordinated 0.6+ pile-on flips the kill, rare on lab1.
//
// We keep the parent's BACKING_WEIGHT=0.5 (its only edge over the
// older trunk) untouched — this is purely a one-knob graft of the
// proven margin from the bots that beat us, into the parent's
// otherwise unchanged kernel.
const MARGIN = 0.45;

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
  name: "Conqueror_g7_36262b",
  author: "claude",
  version: 1,
  description: "g6_27c4e7 with MARGIN tightened from 0.6 to 0.45, matching the bots that beat it in season #118.",
  summary: `Parent Conqueror_g6_27c4e7 lost season #118 to (among
others) Conqueror_g9_d2499d and Conqueror_g9_192ea5. Both winners
share one structurally simple edge over the parent: MARGIN tightened
from 0.6 to 0.45 in the kill-cost formula
  needed = enemy / BONUS + MARGIN
applied consistently to Pass 1 eligibility, tryCommit, and the
Pass 3 reachability bound (sLimit - MARGIN).

Why 0.45 helps: every fight where attackPower lands in
  [enemy/1.4 + 0.45, enemy/1.4 + 0.6)
becomes an actual kill instead of a stall. On lab1 with growth 1.8,
BONUS 1.4, and typical enemy stacks of 1.0..3.5, that band is hit
constantly. Tightening also leaves 0.15 more strength on the home
tile per kill - the compounding benefit the Conqueror lineage is
built around. 0.45 still absorbs sub-0.1 float jitter and a small
mid-tick reinforcement; only a coordinated 0.6+ pile-on flips the
kill, rare on a wrap map this size.

Everything else is exactly the parent: BACKING_WEIGHT=0.5
hemisphere-weighted Pass 1 (the parent's signature edge), Pass 2
fallback to Conqueror.act, and the closest-first 5x5 stencil
stalemate kernel in Pass 3 with matched-threshold tryCommit. Tech
unchanged - {move:90, stack:0, prod:2, atk:4, def:4} is the shared
optimum across the entire winning Conqueror cousin lineage and the
two bots beating us also kept it.

Failure mode if wrong: 0.15 less slack lets the occasional
borderline fight flip on mid-tick reinforcement; recovery is that
the lost band is narrow and the parent's hemisphere score still
prefers the structurally backed kill so we engage from depth.`,
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

    let bestKill = null;
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

    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    if (!stencil) return;
    const reachableEnemyOverBonus = sLimit - MARGIN;

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
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
      if (dist < bestDist || (dist === bestDist && enemy < bestWeak)) {
        bestDist = dist;
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
