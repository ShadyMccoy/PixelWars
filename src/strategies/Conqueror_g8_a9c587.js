import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
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

// Parent Conqueror_g7_143859 lost 5 of 5 in season #53. Three of
// those losses were to Conqueror_g4_1f6790 (seeds 21, 5, 3), one
// to sibling Conqueror_g7_0cfdd6 (seed 15), one to
// Conqueror_g5_4c1ea4 (seed 11). Notably, NONE of those three
// winners use reach-weighted kill scoring — they all pick the
// strongest beatable adjacent enemy by raw enemy strength.
//
// The parent scores Pass 1 candidates as
//   score = enemy + REACH_WEIGHT * friendlyReach   (REACH_WEIGHT=0.5)
// which can flip priority away from the biggest local threat
// toward a smaller enemy that happens to sit near more friendlies.
// Worked example: target A has 5.0 enemy with 0 friendly reach
// (score 5.0); target B has 3.0 enemy with 8.0 friendly reach
// (score 7.0). Parent picks B and lets the 5.0 stack on A keep
// growing. That contradicts the explicit Membrane-stall rationale
// in Conqueror_g4_1f6790's design note ("Defanging the biggest
// local threat is the strictly defensive read; weakest-first
// leaves the threat to snowball"), and g4_1f6790 is the bot that
// won three of the parent's matches outright.
//
// The single change in this descendant: drop REACH_WEIGHT entirely
// from Pass 1 so kill priority is plain strongest-beatable
// (matching g4_1f6790, g7_0cfdd6, and g5_4c1ea4 — all three
// winners). Pass 2 (Conqueror.act fallthrough on any other adjacent
// action) and Pass 3 (two-axis path-clear 5x5 stencil with
// distance-first / clear / weakness-last sort) are unchanged from
// the parent. MARGIN stays at 0.4 (the parent's value, also matches
// g5_4c1ea4's value).
//
// Why this should rank higher without breaking what works:
//   - Pass 3 stencil fallback is preserved verbatim, so the
//     parent's improvement over its own ancestors (handling true
//     stalemates with two-axis stencil routing) is intact.
//   - Pass 1 simplification removes a tunable that empirically
//     correlates with losses: every winner on the parent's loss
//     list omitted reach weighting.
//   - The change is strictly local to one scoring expression; it
//     does not alter target eligibility, attack sizing, or the
//     order of passes. Worst case it's a no-op (if reach weighting
//     was already neutral on this map), best case it defangs the
//     Membrane-style snowballs that g4_1f6790's design note warns
//     about.
//
// Tech unchanged at {move:90, stack:0, prod:2, atk:4, def:4} —
// shared optimum across the winning Conqueror cousin lineage.
export default {
  name: "Conqueror_g8_a9c587",
  author: "claude",
  version: 1,
  description: "Conqueror_g7_143859 with REACH_WEIGHT removed; Pass 1 is plain strongest-beatable adjacent kill.",
  summary: `Parent Conqueror_g7_143859 lost 5 of 5 in season #53.
Three losses were to Conqueror_g4_1f6790, one to sibling
Conqueror_g7_0cfdd6, one to Conqueror_g5_4c1ea4. None of those
three winners use reach-weighted kill scoring — they all pick the
strongest beatable adjacent enemy by raw enemy strength.

The parent's Pass 1 score (enemy + 0.5 * friendlyReach) can flip
priority away from the biggest local threat toward a smaller enemy
sitting near more friendlies. Example: A=5.0 enemy / 0 reach
(score 5.0) vs B=3.0 enemy / 8.0 reach (score 7.0) — parent picks
B and lets A snowball. Conqueror_g4_1f6790's design note explicitly
calls out this failure mode ("Defanging the biggest local threat
is the strictly defensive read; weakest-first leaves the threat to
snowball"), and g4_1f6790 is what won three of the parent's
matches.

This descendant drops REACH_WEIGHT entirely from Pass 1. Kill
priority becomes plain strongest-beatable, matching g4_1f6790,
g7_0cfdd6, and g5_4c1ea4. MARGIN stays at 0.4 (parent's value,
also g5_4c1ea4's). Pass 2 (Conqueror.act on any other adjacent
action) and Pass 3 (two-axis path-clear 5x5 stencil) are preserved
verbatim — the parent's stalemate-routing contribution stays
intact. Tech unchanged at {move:90, stack:0, prod:2, atk:4, def:4}.`,
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

    // Pass 1: strongest beatable adjacent enemy (no reach weighting).
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
        const needed = enemy / BONUS + MARGIN;
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

    // Pass 3: full stalemate. 5x5 stencil with distance-first,
    // two-axis path-clear tiebreak, weakness as final tiebreak.
    if (!tile.stencil5) {
      Conqueror.act(army, game);
      return;
    }
    const stencil = tile.stencil5;
    const viewer = army.player;

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
