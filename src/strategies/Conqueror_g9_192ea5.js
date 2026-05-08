import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const BACKING_WEIGHT = 0.4;

// Tightened from the parent's 0.6 to 0.45. The bot that beat the parent
// in season #82's seed=9 lineup chain was Conqueror_g5_b451ab, whose
// only behavioral edge over the Conqueror trunk is exactly this:
// MARGIN = 0.45 instead of 0.6. The reasoning carries over verbatim
// to the parent's kernel - on lab1 with growth 1.8, BONUS 1.4, and
// typical enemy stacks of 1.0..3.5, the 0.6 slack skips every fight
// where attackPower lands in the band
//   [enemy/1.4 + 0.45, enemy/1.4 + 0.6)
// converting those stalls into kills is the single largest source of
// engagement frequency in the Conqueror cousin lineage. 0.45 still
// absorbs sub-0.1 float jitter and a small mid-tick reinforcement;
// only a coordinated 0.6+ pile-on flips the kill, which is rare on
// a wrap map at this size. The compounding bonus is also still in
// effect - every successful kill leaves 0.15 more strength behind on
// the home tile, which is the kind of waste Conqueror is built to
// avoid in the first place.
//
// Everything else (hemisphere-weighted Pass 1, 4-level path-clear in
// Pass 3, the passability cache) is identical to the parent. This is
// a one-knob change applied consistently to all three places where
// the parent encoded the 0.6 slack: tryCommit, Pass 1 eligibility,
// and the Pass 3 reachability bound (both reachableEnemyOverBonus
// and the inline check inside isPassable).
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
  name: "Conqueror_g9_192ea5",
  author: "claude",
  version: 1,
  description: "g8_2c6b71 with MARGIN tightened from 0.6 to 0.45, matching the bot that beat it.",
  summary: `Parent Conqueror_g8_2c6b71 finished #3 in season #82 seed=9
behind Conqueror_g5_b451ab. b451ab's only meaningful behavioral edge
over the Conqueror trunk is MARGIN=0.45 instead of 0.6 - the same
tightening that won g5_b451ab its head-to-heads in earlier seasons.
The parent inherited the looser 0.6 from g6 and never closed the
gap, so this is the one-knob fix that aligns the parent's kernel
with the threshold of the bot that's been beating it.

Why 0.45 helps even with the parent's smarter target selection: the
hemisphere Pass 1 and 4-level path-clear Pass 3 only matter once a
fight is actually committed. With margin 0.6 the parent skips every
engagement where attackPower lands in [enemy/1.4 + 0.45, enemy/1.4
+ 0.6); on lab1 with typical enemy stacks of 1.0..3.5 that band is
hit constantly. Tightening the margin converts those stalls into
kills without changing what target gets picked. It also leaves 0.15
more strength on the home tile per kill - the exact compounding
benefit that built the Conqueror lineage in the first place.

Risks: 0.45 leaves less slack for mid-tick reinforcement; a 0.6+
pile-on between scoring and resolution can flip the kill. On a wrap
map this size that's rare, and the parent's existing 0.5 friendly-
room bumper handles the friendly-tile case unchanged.

The change is applied consistently in all three spots the parent
encoded 0.6: tryCommit, Pass 1 eligibility (needed = enemy/BONUS +
MARGIN), and the Pass 3 reachability bound (sLimit - MARGIN, both
in reachableEnemyOverBonus and the inline check inside isPassable).
Tech is unchanged - move:90, stack:0, prod:2, atk:4, def:4 has been
the shared optimum across the entire Conqueror cousin lineage.`,
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

    // Pass 1: best beatable adjacent enemy by hemisphere-weighted score.
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

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 with distance-first, two-axis
    // path-clear tiebreak, weakness as final tiebreak.
    if (!stencil) return;
    const reachableEnemyOverBonus = sLimit - MARGIN;

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
        v = (enemy / BONUS <= sLimit - MARGIN) ? 1 : 0;
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
