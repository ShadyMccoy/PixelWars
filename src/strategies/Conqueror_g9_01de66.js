import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const BACKING_WEIGHT = 0.4;
const TERRITORY_BIAS = 0.3;

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

function tryNoMarginKill(army, neighbors, sLimit, pid) {
  if (sLimit <= 0.5) return false;
  const myMults = army.player.techMults;
  const atkMult = (myMults && myMults.atk) || 1;
  const effBonus = BONUS * atkMult;
  let best = null;
  let bestEnemy = Infinity;
  for (let i = 0; i < 4; i++) {
    const t = neighbors[i];
    if (!t) continue;
    const tArmies = t.armies;
    if (tArmies.length === 0) continue;
    let enemy = 0;
    let mixed = false;
    let maxDef = 1;
    for (let k = 0; k < tArmies.length; k++) {
      const a = tArmies[k];
      if (a.player.id === pid) {
        mixed = true;
        continue;
      }
      enemy += a.strength;
      const dm = (a.player.techMults && a.player.techMults.def) || 1;
      if (dm > maxDef) maxDef = dm;
    }
    if (enemy <= 0) continue;
    if (mixed) continue;
    const killCeiling = (sLimit * effBonus) / maxDef - 0.05;
    if (enemy >= killCeiling) continue;
    if (enemy < bestEnemy) {
      bestEnemy = enemy;
      best = t;
    }
  }
  if (best) {
    army.attack(best, sLimit);
    return true;
  }
  return false;
}

// Hypothesis: parent g8_912a4c lost season #109 seed=13 (long ticks=709
// game) to Conqueror_g5_930cc7. g5_930cc7's only behavioral edge over
// the parent's Pass 1 is a +0.3-per-friendly-neighbor TERRITORY bias on
// the kill score: it preferentially captures tiles already surrounded
// by our own ownership so the capture HOLDS next tick instead of
// flipping back. The parent's hemisphere backing is orthogonal — it
// measures enemy structural depth in our hemisphere (which side is
// worth puncturing), while territory bias measures whether the
// captured tile survives. They compose cleanly: hemisphere chooses
// the better punch direction, territory chooses the punch that
// consolidates rather than dilutes. With max hemisphere bonus (~3 raw)
// and max territory bonus (+1.2), both stay sub-1-army-strength so
// they only flip rankings on near-ties — clear membrane threats still
// get killed first (defense thesis intact). Direct evidence the
// territory lever beats this parent in long games — and our seed=13
// loss was 709 ticks. Tech unchanged at the lineage anchor.
export default {
  name: "Conqueror_g9_01de66",
  author: "claude",
  version: 1,
  description: "Parent g8_912a4c + g5_930cc7's territory bias on Pass 1 kill priority.",
  summary: `Parent Conqueror_g8_912a4c lost season #109 seed=13 to
Conqueror_g5_930cc7 in a long 709-tick game. g5_930cc7's only
behavioral edge over the parent's Pass 1 is a small territory bias
on the kill score: +0.3 per friendly-owned neighbor of the candidate
tile. The motivation is well-documented in g5_930cc7 itself — a kill
into a tile with no friendly territory backing routinely flips back
next tick, wasting the reserve, while a kill that captures a tile
already surrounded by our ownership holds because friendly neighbors
discourage retake.

The parent's hemisphere backing and g5_930cc7's territory bias are
fully orthogonal:
  - hemisphere backing measures ENEMY structural depth in our
    direction's hemisphere of the 5x5 stencil. It picks WHICH SIDE
    is worth puncturing.
  - territory bias measures FRIENDLY territorial support around the
    target tile. It picks the punch that CONSOLIDATES vs the punch
    that dilutes.

Composing them: Pass 1 score becomes
  enemy + 0.4 * hemisphere_backing + 0.3 * friendly_neighbors

Magnitudes are well-balanced. Hemisphere backing maxes around ~3 raw
strength units (8 cells of meaningful enemy mass at 0.4 weight);
territory bias maxes at +1.2 (4 friendly neighbors). Both stay below
1 army of strength worth, so they only flip rankings on near-ties —
the strongest membrane threat still gets killed first (parent's
defense thesis intact). Falls through to the parent's Pass 2/3/4
unchanged.

The seed=13 loss is direct head-to-head evidence that the territory
lever pays off in long games against this exact parent. The lever
is also defensible *a priori*: capturing held territory is strictly
better than capturing isolated tiles whose recapture costs the
opponent nothing structurally.

Tech unchanged at the lineage anchor.`,
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
    // score + territory bias (g5_930cc7's lever, +0.3 per friendly
    // neighbor of the target tile — biases toward captures that
    // hold).
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
        const needed = enemy / BONUS + 0.6;
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

    // Pass 2 (parent, unchanged): defer to Conqueror.act for any
    // other adjacent action.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3 (parent, unchanged): walk-all-candidates 5x5 stalemate.
    if (!stencil) {
      tryNoMarginKill(army, neighbors, sLimit, pid);
      return;
    }

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

    const candidates = [];
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
      candidates.push(dist, clear, enemy, hints[0], hints[1]);
    }

    if (candidates.length > 0) {
      const stride = 5;
      const n = candidates.length / stride;
      for (let a = 0; a < n - 1; a++) {
        for (let b = 0; b < n - 1 - a; b++) {
          const ai = b * stride;
          const bi = ai + stride;
          const ad = candidates[ai];
          const bd = candidates[bi];
          const ac = candidates[ai + 1];
          const bc = candidates[bi + 1];
          const ae = candidates[ai + 2];
          const be = candidates[bi + 2];
          const swap =
            ad > bd
            || (ad === bd && ac < bc)
            || (ad === bd && ac === bc && ae > be);
          if (swap) {
            for (let s = 0; s < stride; s++) {
              const tmp = candidates[ai + s];
              candidates[ai + s] = candidates[bi + s];
              candidates[bi + s] = tmp;
            }
          }
        }
      }

      for (let c = 0; c < n; c++) {
        const ci = c * stride;
        const prim = candidates[ci + 3];
        const sec = candidates[ci + 4];
        const primaryTarget = neighbors[prim];
        if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
        if (sec < 0) continue;
        const secondaryTarget = neighbors[sec];
        if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
      }
    }

    // Pass 4 (parent, unchanged): no-margin kill safety net.
    tryNoMarginKill(army, neighbors, sLimit, pid);
  },
};
