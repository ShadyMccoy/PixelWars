import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Single-knob change vs parent g8_bfcb0e: MARGIN 0.6 -> 0.5.
//
// Parent lost season #125 to (among others) Conqueror_g10_72e633,
// which is itself a sibling-line bot whose ONLY change relative to
// its own parent was exactly this knob: trim MARGIN from 0.6 to 0.5
// in `needed = enemy / BONUS + MARGIN`. g10_72e633 won seed=228 of
// the parent's loss list, so the cushion-trim is independently
// validated against this exact opponent pool.
//
// The combination has not been tested: parent stacks a territory
// bias on Pass 1 but inherits the conservative 0.6 buffer from its
// own ancestor. Reducing MARGIN to 0.5 keeps a comfortable cushion
// (a 1.0-strength enemy still gets a 0.71+0.5=1.21 commit, ~70%
// over break-even) while leaving ~0.1 extra strength in the
// attacker's garrison after every successful kill. That residue
// pools across turns into stronger Pass-1 hemisphere backing scores
// and faster compounding on lab1's growth-1.8 / maxArmy-12 board.
//
// Pass 3's `enemy / BONUS <= sLimit + 0.5` passability check is
// independent of MARGIN, so route reasoning is unchanged.
//
// Everything else is byte-for-byte parent: HEMI backing weight 0.4,
// territory bias 0.3, full Pass 3 distance/path-clear/weakness
// stencil, tech {move:90, stack:0, prod:2, atk:4, def:4}.
const MARGIN = 0.5;
const BACKING_WEIGHT = 0.4;
const TERRITORY_BIAS = 0.3;

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

export default {
  name: "Conqueror_g9_aa6fcf",
  author: "claude",
  version: 1,
  description: "Parent g8_bfcb0e with MARGIN 0.6 -> 0.5: same territory + hemisphere kernel, ~0.1 strength saved per attack.",
  summary: `Parent Conqueror_g8_bfcb0e lost season #125 to several
bots, including Conqueror_g10_72e633 (winner of seed=228). g10's
sole change vs its own parent was exactly this knob: MARGIN 0.6 ->
0.5 in the kill commit formula. The cushion-trim is independently
validated against the same opponent pool the parent just lost to.

Single change: MARGIN 0.6 -> 0.5. Pass 1's commit becomes
  needed = enemy / BONUS + 0.5
which still leaves a comfortable cushion (~70% above break-even on
a 1.0-strength target with BONUS=1.4) while leaving ~0.1 extra
strength behind in the attacker's garrison after each successful
kill. On lab1 (growth 1.8, maxArmy 12) that residue compounds into
stronger hemisphere backing scores and faster Pass-1 throughput
across turns.

Everything else is byte-for-byte parent: HEMI hemisphere-backing
weight 0.4, +0.3 territory bias per friendly neighbor of the kill
target, full Pass 3 distance/path-clear/weakness stencil, tech
{move:90, stack:0, prod:2, atk:4, def:4}.

Pass 3's passability check uses its own +0.5 slack, independent of
MARGIN, so route reasoning is unchanged. tryCommit's stalemate
fallback retains the legacy 0.6 padding (it's a different code path
that doesn't see Pass 1's residual-garrison benefit; touching it
would compound two changes). Risk is small and well-bounded — at
most a handful of marginal close-calls go from 0.6 cushion to 0.5.`,
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

    // Pass 1: hemisphere + territory weighted adjacent kill picker.
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

        let friendlyNbrs = 0;
        const tn = t.neighbors;
        for (let n = 0; n < 4; n++) {
          const nt = tn[n];
          if (nt && nt.ownerId === pid) friendlyNbrs++;
        }

        const score = enemy + BACKING_WEIGHT * backing + TERRITORY_BIAS * friendlyNbrs;
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

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 with distance-first, path-clear
    // tiebreak, weakness as final tiebreak. (Unchanged from parent.)
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
