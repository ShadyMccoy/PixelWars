import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.6;
const BACKING_WEIGHT = 0.4;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.8;

// Hemisphere indices for the 5x5 stencil (W=0, E=1, N=2, S=3) with
// axis cells excluded so hemispheres don't overlap.
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

// Parent g8 lost season #79 seed=9 to Conqueror_g6_1cded0 on lab1.
// g6's headline kernel addition is a hard "free-retake" veto in
// Pass 1: skip captures where the worst single enemy stack on the
// target's other cardinal neighbors is >= 1.8 — the post-capture
// survivor is only ~0.84 strength (0.6 * 1.4 with min margin), so
// any 1.8+ neighbor retakes for ~1.2 strength next tick. These
// captures are tempo-negative and the parent had no protection
// against them.
//
// Worse, parent's hemisphere-weighted Pass 1 actively *biases
// toward* deep-backing kills (score = enemy + 0.4 * backing),
// which is exactly the pyrrhic-kill profile g6's veto rejects.
// The hemisphere signal is still useful when the kill is safe
// (it defangs deep mass), but only as a tiebreak among kills
// that aren't free-retakes.
//
// Layer in three changes from g6 onto parent's kernel:
//
//   (a) Free-retake veto: skip if max enemy on target's other
//       neighbors >= 1.8.
//   (b) Friendly-backup reward: +0.4 * best friendly on target's
//       other neighbors, so kills into our salient win ties.
//   (c) Score becomes enemy + 0.4 * hemiBacking + 0.4 * friend,
//       gated by the veto. Hemisphere stays — it's still the
//       right tactical tiebreak — but no longer overrides a
//       free-retake.
//
// Pass 3 (path-clear stencil tiebreak) and tech (80/12/2/3/3 for
// lab1's maxArmy=12) are unchanged — those bets are independent
// of the head-to-head loss and parent's reasoning still holds.
export default {
  name: "Conqueror_g9_bbe71a",
  author: "claude",
  version: 1,
  description: "g8 + g6's free-retake veto and friendly-backup reward in Pass 1.",
  summary: `Parent Conqueror_g8_9d8b65 lost season #79 seed=9 on
lab1 to Conqueror_g6_1cded0. g6's defining kernel feature is a
hard veto on free-retake captures: skip kills whose target has
another neighbor with >= 1.8 enemy strength, because the
post-capture survivor (~0.84 strength) gets retaken at minimum
cost the next tick. Parent had no equivalent guard, and worse,
its hemisphere-weighted Pass 1 actively rewards deep enemy
backing — the precise profile of a pyrrhic free-retake kill.

This descendant layers three pieces from g6 onto g8's kernel:

  (a) Free-retake veto on Pass 1 candidates: scan the target's
      other cardinal neighbors; if max enemy stack >= 1.8, skip.
  (b) Friendly-backup reward: +0.4 * best friendly stack on the
      target's other neighbors, breaking ties toward salient
      captures.
  (c) Combined score: enemy + 0.4 * hemiBacking + 0.4 * friend,
      gated by the veto. Hemisphere weighting is preserved as a
      tactical tiebreak among safe kills — the parent's bet
      that defanging deep mass is good is still right when the
      kill itself isn't tempo-negative.

Pass 3 (path-clear stencil tiebreak) is unchanged; it fires on a
disjoint entry condition and was a clean win for the parent.

Tech 80/12/2/3/3 is unchanged. Parent's reasoning — that lab1's
maxArmy=12 makes stack worth 10 points off move — is independent
of the seed=9 loss, which was kernel-driven (deep-backing
pyrrhic kills), not tech-driven. Holding tech constant lets the
kernel change be tested in isolation; if g9 underperforms, the
next sibling can shift toward g6's tech (90/0/2/4/4) instead.

Failure modes to watch:
  - Veto threshold 1.8 was tuned for tech 90/0/2/4/4. With
    g8's tech the survivor is ~the same (margin 0.6 dominates),
    so 1.8 should still be the right knob, but if the bot
    refuses too many kills, lower to 2.0 in a sibling.
  - Friendly-backup reward at 0.4 may double-count with
    hemisphere weighting in some configurations. Both signals
    are positive and both are bounded, so worst case is a mild
    bias rather than a regression.`,
  tech: { move: 80, stack: 12, prod: 2, atk: 3, def: 3 },
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

    // Pass 1: hemisphere-weighted adjacent kill picker, with g6's
    // free-retake veto and friendly-backup reward layered on.
    let bestTile = null;
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

        // Worst enemy / best friendly stack on the target's other
        // cardinal neighbors. Worst enemy gates the veto; best
        // friendly contributes to the score.
        let backup = 0;
        let friend = 0;
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
          if (tnE > backup) backup = tnE;
          if (tnF > friend) friend = tnF;
        }
        if (backup >= RETAKE_VETO) continue;

        let hemiBacking = 0;
        if (stencil) {
          const idxs = HEMI[i];
          for (let k = 0; k < idxs.length; k++) {
            const cell = stencil[idxs[k]];
            if (!cell) continue;
            const cArmies = cell.armies;
            if (cArmies.length === 0) continue;
            const e = -sumStrength(cArmies, viewer);
            if (e > 0) hemiBacking += e;
          }
        }
        const score = enemy + BACKING_WEIGHT * hemiBacking + FRIENDLY_W * friend;
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
