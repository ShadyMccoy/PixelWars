import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Single-knob change vs parent g8_bfcb0e: MARGIN 0.6 -> 0.45.
//
// Parent lost season #124 in 5 of the recent seeds. Two of the
// three named winners I have full source for credit a tighter
// MARGIN as their load-bearing change vs their own parents:
//   - Conqueror_g8_838926 (winner of seed=233): MARGIN 0.6 -> 0.4
//   - Conqueror_g9_e06b76 (winner of seed=229): MARGIN 0.6 -> 0.45
//
// g9_e06b76 in particular ran the same hemisphere-weighted Pass 1
// chassis as our parent (BACKING_WEIGHT=0.4 included), and isolated
// MARGIN 0.6 -> 0.45 as the only kernel diff vs its parent. That's
// a near-controlled experiment on the same scoring philosophy our
// parent uses, and the tighter value won.
//
// Hypothesis: parent's MARGIN=0.6 leaves every fight in the band
// [enemy/BONUS + 0.45, enemy/BONUS + 0.6) as a stall instead of a
// kill. Compounded across long Membrane-style projection matches
// on lab1 (30x22 wrap, growth 1.8) those refused edge kills are
// the difference between mid-pack and winning. 0.45 still leaves
// survivor strength at 0.45 * 1.4 = 0.63 above the 0.5 positive-
// ownership floor, so flip-back exposure stays bounded.
//
// I'm picking 0.45 not 0.4 because g9_e06b76 ran on the same
// hemisphere chassis as our parent, while g8_838926 was on a
// different (backup-aware) chassis where 0.4 was tuned. Matching
// the closer cousin keeps the comparison clean.
//
// Everything else preserved from parent: hemisphere-weighted
// Pass 1 with BACKING_WEIGHT=0.4 + TERRITORY_BIAS=0.3 (parent's
// own lever from g9_01de66), Pass 2 Conqueror.act fallback, Pass 3
// 5x5 path-clear stencil, tech {move:90, stack:0, prod:2, atk:4,
// def:4}. This isolates MARGIN as the only variable so the season
// delta is cleanly attributable.
const MARGIN = 0.45;
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
  name: "Conqueror_g9_01533b",
  author: "claude",
  version: 1,
  description: "Parent g8_bfcb0e with MARGIN 0.6 -> 0.45, matching the validated tighter margin of sibling winner g9_e06b76 on the same hemisphere chassis.",
  summary: `Parent Conqueror_g8_bfcb0e lost season #124 in 5 of the
recent seeds. Two of the three named winners I have full source
for credit a tighter MARGIN as their load-bearing change:

  - Conqueror_g8_838926 (seed=233 winner): MARGIN 0.6 -> 0.4
  - Conqueror_g9_e06b76 (seed=229 winner): MARGIN 0.6 -> 0.45

g9_e06b76 ran the same hemisphere-weighted Pass 1 chassis as our
parent (BACKING_WEIGHT=0.4) and isolated MARGIN as the only
kernel variable vs its own parent. That's a near-controlled
experiment on the same scoring philosophy, and the tighter value
won.

Single change: MARGIN 0.6 -> 0.45 in Pass 1 admission and
tryCommit. Picks up every fight in [enemy/BONUS + 0.45,
enemy/BONUS + 0.6) as a kill instead of a stall, leaves 0.15
more strength in the garrison per committed kill. Survivor
strength on a tight kill is 0.45 * 1.4 = 0.63, still above the
kernel's 0.5 positive-ownership floor.

Picked 0.45 (not 838926's 0.4) because e06b76 was on the closer
cousin chassis - matching it keeps attribution clean. If 0.45
proves the right direction, future descendants can step further
to 0.4.

Everything else preserved from parent: hemisphere-weighted Pass
1 with BACKING_WEIGHT=0.4, TERRITORY_BIAS=0.3 (parent's own
g9_01de66-derived lever), Pass 2 Conqueror.act fallback, Pass 3
5x5 path-clear stencil. Tech unchanged at {move:90, stack:0,
prod:2, atk:4, def:4}.

If this descendant lifts vs parent, the tighter-MARGIN thesis
is validated on the hemisphere+territory chassis. If it
doesn't, MARGIN was not load-bearing for parent and the gap is
elsewhere (likely the Pass 3 fallback or interaction between
the two scoring biases).`,
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

    // Pass 1: best beatable adjacent enemy by hemisphere-weighted
    // threat score + territory bias. MARGIN tightened 0.6 -> 0.45.
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
