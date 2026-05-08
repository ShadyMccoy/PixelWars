import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

// Two constant tunes vs Conqueror_g7_3b651e:
//   BACKING_WEIGHT: 0.4 -> 0.6 (push hemisphere selection harder)
//   MARGIN:        0.6 -> 0.4 (commit less excess on kills,
//                              leaving more residual for next tick)
const BONUS = 1.4;
const MARGIN = 0.4;
const BACKING_WEIGHT = 0.6;

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

// Parent Conqueror_g7_3b651e dominated season #85 with no recorded
// losses, so the three-pass kernel (hemisphere-weighted adjacent
// kill / Conqueror.act fallback / closest-first stencil with
// path-clear tiebreak) is sound. With no loss to react to, this
// descendant is exploration: push two of the parent's tuning
// constants and see if the dial settings the parent inherited from
// g6 are still optimal at this rank.
//
//   1. BACKING_WEIGHT 0.4 -> 0.6. The hemisphere weighting beat the
//      path-clear tiebreak head-to-head at g6; raising the weight
//      makes Pass 1 commit harder to deepest-backing kills when two
//      adjacent enemies are both beatable. At 0.4 a 4-strength
//      adjacent enemy with no backing (score 4.0) ties a 3-strength
//      enemy with 2.5 of hemisphere mass behind it (score 4.0). At
//      0.6 the latter wins (score 4.5). That's the case hemisphere
//      weighting is meant to catch.
//
//   2. MARGIN 0.6 -> 0.4. The tryCommit / Pass 1 kill formula is
//      `needed = enemy / BONUS + MARGIN`. Engine BONUS is 1.4 so
//      enemy=4 needs strength 4/1.4 + 0.4 = 3.26 (was 3.46 with the
//      old margin). Sub-floating-point math is exact in the engine,
//      so 0.4 still clears the +1 attacker-margin requirement with
//      headroom; the 0.2 saved per kill stays as residual on our
//      tile, available for follow-up next tick. Over a long match
//      that compounds into more stencil reach without giving up
//      kill reliability.
//
// Tech unchanged at 90/0/2/4/4 - shared optimum across the winning
// lineage; no signal to change it. All other passes (Conqueror
// fallback, path-clear stencil tiebreak) are byte-identical to
// the parent.
export default {
  name: "Conqueror_g8_7c11fe",
  author: "claude",
  version: 1,
  description: "g7_3b651e with stronger hemisphere weighting (0.6) and tighter kill margin (0.4).",
  summary: `Parent Conqueror_g7_3b651e dominated season #85 with
no recorded losses. With no loss to react to, this descendant is
exploration: tune two constants the parent inherited from g6 and
see if the existing dial settings are still optimal.

Two changes vs the parent, both constants only:

1. BACKING_WEIGHT 0.4 -> 0.6. Pass 1 scores beatable adjacent
   enemies as enemy + WEIGHT * sum-of-hemisphere-enemy-mass. The
   hemisphere weighting beat the rival path-clear tiebreak in
   g6's head-to-head, so leaning harder on it should help break
   ties toward kills that punch into deeper enemy backing. At
   weight 0.4, 4 strength flat ties 3 strength + 2.5 backing; at
   weight 0.6, the backed enemy wins. That's exactly the case
   the weighting exists to catch.

2. MARGIN 0.6 -> 0.4. Both the tryCommit helper and Pass 1
   compute kill cost as enemy/BONUS + MARGIN, where BONUS is the
   engine's 1.4x attacker bonus. Lowering the margin to 0.4 still
   clears the engine's attacker-margin floor with headroom, but
   leaves an extra 0.2 strength on our tile per kill - residual
   that compounds into more attackPower next tick.

All other code paths (Pass 2 deferral to Conqueror.act, Pass 3
closest-first 5x5 stencil with path-clear primary-lane tiebreak)
are byte-identical to g7_3b651e. Tech unchanged at 90/0/2/4/4 -
the shared optimum across the winning lineage.`,
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
