import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const REACH_WEIGHT = 0.5;
const MARGIN = 0.4;

// Stencil5 cell -> [primary dir, secondary dir]. W=0, E=1, N=2, S=3.
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

// Parent Conqueror_g6_15ea9a kept reach-weighted strongest-beatable
// kill priority (REACH_WEIGHT=0.5) + MARGIN=0.4, then fell through
// straight to Conqueror.act. That's a 2-pass kernel with no
// dedicated stalemate move-up — when no adjacent action exists,
// Conqueror.act handles whatever it handles and the army may stall.
//
// Three of five season #52 losses were long matches (209, 267, 320
// ticks) on the 24x18 lab1 wrap map. The bots that beat the parent
// in those matches (g6_aa7266 winner of seed=27 ticks=209;
// g7_0cfdd6 winner of seed=15 ticks=320; g5_c09169 winner of
// seed=11 ticks=267) all share one thing the parent lacks: a 5x5
// stencil fallback that runs when no adjacent move is available,
// converting "nothing to do" ticks into directed motion toward the
// nearest beatable enemy in the 5x5 neighborhood.
//
// The change here grafts g7_0cfdd6's two-axis path-clear stencil
// fallback onto the parent's reach-weighted kernel. Pass 1 is
// unchanged: strongest beatable adjacent enemy scored by
// `enemy + REACH_WEIGHT * friendlyReach`, attacking with
// `enemy / BONUS + MARGIN`. Pass 2 short-circuits to Conqueror.act
// when any other adjacent action exists (empty tile or refillable
// friendly), so we don't disturb the parent's kernel-handled cases.
// Pass 3 fires only on true stalemate — no adjacent target at all
// — and runs distance-first / two-axis-clear / weakness-last
// selection over the stencil5, then commits via tryCommit (primary
// axis, secondary on fallback).
//
// Why this should rank higher than the parent without breaking
// what works:
//   - Pass 1 preserves the parent's two compounded levers
//     (REACH_WEIGHT=0.5 reach scoring, MARGIN=0.4 seam-opening
//     kills) verbatim. If those were neutral or positive for the
//     parent vs its own losses, they remain so.
//   - Pass 3 adds new behavior only in cases where the parent did
//     nothing useful. The downside risk is bounded: a stencil
//     commit on a tick where Conqueror.act would have made a
//     better move can't happen, because Pass 2 always defers to
//     Conqueror.act when any adjacent target is reachable.
//   - The two-axis path-clear scoring (clear = primClear*2 +
//     secClear, range 0..3) matches what tryCommit will actually
//     try, so the stencil pick reflects real reachability rather
//     than ideal reachability.
//
// Tech unchanged at {move:90, stack:0, prod:2, atk:4, def:4}: the
// move-heavy budget is what makes the saved strength per kill
// actually exploitable on the next tick, and the stencil fallback
// only amplifies that — the lower garrison floor means each
// stalemate-routed army has more strength to spend on the
// stencil-selected target.
export default {
  name: "Conqueror_g7_143859",
  author: "claude",
  version: 1,
  description: "Conqueror_g6_15ea9a with a two-axis path-clear 5x5 stencil fallback for stalemates.",
  summary: `Parent Conqueror_g6_15ea9a kept reach-weighted strongest-
beatable kill priority and MARGIN=0.4 but had no dedicated
stalemate move-up — it fell straight from Pass 1 to Conqueror.act.
Three of five season #52 losses were long matches (209-320 ticks),
and all three winners that beat the parent in those long matches
(g6_aa7266, g7_0cfdd6, g5_c09169) share a 5x5 stencil fallback the
parent lacks.

This descendant grafts g7_0cfdd6's two-axis path-clear stencil
fallback onto the parent's existing kernel. Pass 1 is unchanged:
strongest beatable adjacent enemy scored by enemy + 0.5 *
friendlyReach, attacking with enemy/BONUS + 0.4. Pass 2
short-circuits to Conqueror.act whenever any other adjacent action
exists (empty tile, refillable friendly), preserving the parent's
kernel-handled cases. Pass 3 fires only on true stalemate and uses
distance-first / two-axis-clear / weakness-last selection over the
stencil5 with primary+secondary tryCommit routing.

The two-axis path-clear score (clear = primClear*2 + secClear,
range 0..3) prefers stencil targets where ANY routing lane is
currently open, biased toward the primary axis — matching what
tryCommit will actually try. Tech unchanged at
{move:90, stack:0, prod:2, atk:4, def:4}: the move-heavy budget
amplifies stencil-routed motion (lower garrison floor = more
strength to spend on the selected target).`,
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

    // Pass 1: parent's reach-weighted strongest beatable adjacent enemy.
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
        let friendlyReach = 0;
        const enbrs = t.neighbors;
        for (let n = 0; n < 4; n++) {
          const nt = enbrs[n];
          if (!nt) continue;
          const na = nt.armies;
          for (let k = 0; k < na.length; k++) {
            const a = na[k];
            if (a.player.id === pid) friendlyReach += a.strength;
          }
        }
        const score = enemy + REACH_WEIGHT * friendlyReach;
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

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 stencil with distance-first,
    // two-axis path-clear tiebreak, weakness as final tiebreak.
    if (!tile.stencil5) {
      Conqueror.act(army, game);
      return;
    }
    const stencil = tile.stencil5;
    const viewer = army.player;

    // Cache neighbor passability for the four cardinal directions:
    //   1 = passable (empty, friendly with room, or beatable enemy)
    //   0 = blocked (no neighbor, strong enemy, or full friendly)
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
    if (bestPrim < 0) {
      Conqueror.act(army, game);
      return;
    }

    const primaryTarget = neighbors[bestPrim];
    if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
    if (bestSec < 0) {
      Conqueror.act(army, game);
      return;
    }
    const secondaryTarget = neighbors[bestSec];
    if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
    Conqueror.act(army, game);
  },
};
