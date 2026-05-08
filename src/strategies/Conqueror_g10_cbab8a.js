import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const EXPOSURE_WEIGHT = 0.2;
const RETAKE_WEIGHT = 0.6;

// Hypothesis: parent dominated season #110, so the strategy code is
// already in a good basin. The remaining lever flagged by the spawner
// is tech: this lineage almost never re-allocates, and move:90 is the
// canonical "ride high garrison floor + pay almost nothing for combat
// or production" recipe. With MARGIN tightened to 0.45 we now spend
// less strength per kill, which means a larger fraction of each tile's
// produced strength is actually deployable -- so production becomes
// strictly more valuable than it was at MARGIN=0.6. Reallocating 10
// points from move (90 -> 80, garrison floor stays comfortably high
// for a 30x22 lab1 board with maxArmy 12) into prod (2 -> 12) should
// raise the per-turn supply that feeds the (now more efficient)
// kill loop. atk/def left at 4/4 because the strategy's needed-strength
// math is keyed off BONUS=1.4 -- moving atk would either waste surplus
// (if BONUS rises) or risk under-committing (if it doesn't), and the
// safer experiment is to fund more kills rather than cheapen each one.
//
// Failure mode: the prod slope may be sub-linear and 10 points only buys
// a small multiplier. Even then, this should be neutral-to-slightly
// positive vs the parent because move:80 still saturates the garrison
// floor on this map. If it loses, the next descendant should pull the
// shift back to ~5 points instead of 10.

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
  name: "Conqueror_g10_cbab8a",
  author: "claude",
  version: 1,
  description: "Conqueror_g9_a22c1e with 10 tech points moved from move (90->80) into prod (2->12).",
  summary: `Strategy code is identical to parent Conqueror_g9_a22c1e --
parent dominated season #110 with no recorded losses, so there's no
behavioural pothole to patch. The change is purely tech.

The lineage has spent ~10 generations holding tech constant at
move:90, stack:0, prod:2, atk:4, def:4 while tuning strategy
constants. The spawner explicitly flags tech as under-explored.
Two facts make a move->prod shift the cleanest first probe:

1. The parent (and its parent g8) tightened MARGIN to 0.45. Smaller
   margin means less strength burned per kill, which means a
   larger fraction of produced strength is *deployable*. Production
   is therefore worth more in a 0.45-margin world than in a
   0.6-margin world -- the marginal value of prod went up exactly
   as we approached this generation.

2. move:90 is far past the saturation point for lab1's 30x22 map
   with maxArmy 12. Dropping to 80 should keep the garrison floor
   well above what the strategy actually consumes per tick.

So: move 90 -> 80, prod 2 -> 12, leave atk/def at 4 (the strategy's
needed-strength math is hardcoded to BONUS=1.4, and changing atk
without changing that constant either wastes strength or
under-commits). Strategy constants -- MARGIN, BONUS, the four
selection weights -- are all unchanged.

Failure mode: prod's slope may be sub-linear enough that +10
points buys little, while the lost 10 move points cost a tiny
amount of garrison flexibility. Expected to be neutral-to-positive;
if it regresses, the next iteration should try a smaller +5 prod
shift instead.`,
  tech: { move: 80, stack: 0, prod: 12, atk: 4, def: 4 },
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
    let bestScore = -Infinity;
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
        let exposure = 0;
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
          const oppIdxs = HEMI[i ^ 1];
          for (let k = 0; k < oppIdxs.length; k++) {
            const cell = stencil[oppIdxs[k]];
            if (!cell) continue;
            const cArmies = cell.armies;
            if (cArmies.length === 0) continue;
            const e = -sumStrength(cArmies, viewer);
            if (e > 0) exposure += e;
          }
        }

        let netThreat = 0;
        const tn = t.neighbors;
        for (let j = 0; j < 4; j++) {
          const tt = tn[j];
          if (!tt || tt === tile) continue;
          const ttArmies = tt.armies;
          let tnE = 0;
          let tnF = 0;
          for (let k = 0; k < ttArmies.length; k++) {
            const a = ttArmies[k];
            if (a.player.id === pid) tnF += a.strength;
            else tnE += a.strength;
          }
          const net = tnE - tnF;
          if (net > 0) netThreat += net;
        }

        const score =
          enemy
          + BACKING_WEIGHT * backing
          - EXPOSURE_WEIGHT * exposure
          - RETAKE_WEIGHT * netThreat;
        if (score > bestScore) {
          bestScore = score;
          bestKill = t;
          bestNeeded = needed;
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
