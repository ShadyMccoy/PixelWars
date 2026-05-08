import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const BACKING_WEIGHT = 0.4;

// Stencil5 cell -> [primary dir, secondary dir]. Primary is the
// dominant-axis step (W=0, E=1, N=2, S=3); secondary is the off-axis
// step (or -1 if the cell sits exactly on one axis).
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

// Per cardinal (W=0, E=1, N=2, S=3) the strict-hemisphere stencil5
// indices, excluding the orthogonal axis so the four hemispheres
// don't double-count cells directly beside us.
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

// Parent g4_3fd4ce lost season #102 three times, two of them to bots
// (g8_82d39b and g8_912a4c) that share a single targeted change to
// Pass 1: hemisphere-weighted kill scoring instead of pure
// max-strength selection. Among beatable adjacent enemies, score by
// `enemy + 0.4 * sum(enemy_strength in that direction's hemisphere
// of the 5x5 stencil)`. Adjacent value (1.0) still dominates the
// hemisphere term (0.4 spread across up to 10 cells), so genuinely
// uneven matchups still kill the strongest local target; ties and
// near-ties go to the side with more enemy structural depth - the
// wall worth puncturing first instead of the thinnest facade.
//
// Pass 2 (Conqueror.act fallback) and Pass 3 (closest-first 5x5
// stalemate stencil with matched commit threshold) are left strictly
// intact - those are the parent's own edge over its sibling g3.
// Tech is also unchanged: the loss signal points at adjacent kill
// selection, not allocation.
export default {
  name: "Conqueror_g5_f15d3e",
  author: "claude",
  version: 1,
  description: "g4_3fd4ce with hemisphere-weighted Pass 1 grafted from the two siblings that beat it.",
  summary: `Parent Conqueror_g4_3fd4ce lost season #102 three times,
two to bots (Conqueror_g8_82d39b, Conqueror_g8_912a4c) that share a
single targeted change vs g4: hemisphere-weighted Pass 1 scoring.
The third loser (Conqueror_g6_1cded0) attacks a different angle
(retake-aware kill scoring) - that's a thesis change, not a tweak,
so we hold off and copy the cheaper, well-replicated upgrade.

This descendant grafts hemisphere-weighted Pass 1 onto the parent
unchanged: among beatable adjacent enemies, score by
  enemy + 0.4 * (sum of enemy strength in that direction's strict
                 hemisphere of the 5x5 stencil)
Adjacent value (1.0) still outweighs the spread hemisphere term
(0.4 across up to 10 cells), so unbalanced match-ups still kill the
strongest local target; ties and near-ties resolve toward the side
with more enemy structural mass - the wall worth puncturing first
rather than the thinnest facade.

Pass 2 (Conqueror.act for empty-grab/friendly-balance) and Pass 3
(closest-first 5x5 stalemate stencil with matched commit threshold)
are strictly unchanged. Pass 3 is the parent's own edge over its
direct ancestor and we don't surrender it.

Tech also unchanged at {move:90, stack:0, prod:2, atk:4, def:4} -
the shared optimum across this winning Conqueror cousin lineage,
and the loss signal targets kill priority, not allocation.`,
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
    // threat score. Adjacent (1.0) still outweighs the spread
    // hemisphere term (0.4 over up to 10 cells); ties resolve toward
    // the side with more enemy structural mass.
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

    // Pass 2: any other adjacent action viable -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3 (parent g4_3fd4ce, unchanged): full stalemate. Look 2
    // deep for the closest beatable enemy (tiebreak weakest) and step
    // toward it. Threshold matches tryCommit's commit margin so
    // unreachable targets don't crowd reachable ones.
    if (!stencil) return;
    const reachableEnemyOverBonus = sLimit - 0.6;

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
