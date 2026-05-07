import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.6;
const BACKING_WEIGHT = 0.4;

// g5's hemisphere indices (W=0, E=1, N=2, S=3 -> stencil5 cells in
// that hemisphere, axis cells excluded so hemispheres don't overlap).
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

// g3's primary/secondary axis hints per stencil5 cell. Used when the
// army stalls and we step toward a 2-deep prey: try the dominant
// axis, then the off-axis if the primary neighbor is blocked.
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

// Parent g5 lost season #9 with two max-tick stalls (4000 ticks vs
// Membrane_g1_b9f1d5 seed=62 and Spearhead_g1_7089d3 seed=20) plus
// three timed losses to siblings: Conqueror_g3_51d526 twice and
// Conqueror_g1_879a88 once.
//
// The damning result is the two losses to g3. g3 specifically fixed
// max-tick stalls with a 2-deep stencil fallback + secondary-axis
// hint: when no adjacent move is viable, look 2 tiles away for the
// weakest beatable enemy and step toward it, trying the off-axis
// neighbor when the primary is a full friendly. g4/g5 dropped that
// fallback in favor of plain Conqueror.act, which has no 2-deep
// logic - so g5 still idles in the exact deadlock states g3 fixed.
//
// This descendant composes both: g5's hemisphere-weighted adjacent
// kill picker (still helps punch through Membrane's facade) up
// front, and g3's stalled-path fallback (2-deep weakest beatable
// enemy with primary/secondary axis) when no adjacent kill is
// viable AND Conqueror has nothing else to do (no empty grab, no
// friendly to balance into). The two paths don't conflict because
// they run on disjoint conditions.
//
// Tech unchanged at 90/0/2/4/4.
export default {
  name: "Conqueror_g6_936d2f",
  author: "claude",
  version: 1,
  description: "Conqueror_g5 hemisphere kill scoring + g3's 2-deep secondary-axis stalled-path fallback.",
  summary: `Parent Conqueror_g5_ff0e8a lost season #9 with two
max-tick stalls (vs Membrane seed=62 and Spearhead seed=20) and
two head-to-head losses to Conqueror_g3_51d626 (seeds 80, 50).
The g3 losses are the structural clue: g3's signature change was
a 2-deep stencil fallback with primary+secondary axis hints that
converts stalled ticks into movement when the dominant-axis
neighbor is a full friendly tile. g5 preserved g4's hemisphere
weighting on the adjacent prescan but fell back to plain
Conqueror.act on stalls - which has no 2-deep logic, so the
Membrane / Spearhead deadlocks that g3 fixed are still present
in g5.

g6 unifies both improvements:

1. ADJACENT path (from g5): if any cardinal neighbor holds a
   beatable enemy, pick the one with highest score = enemy +
   0.4 * hemisphere-backing. Adjacent strength still dominates;
   ties break toward the side with more enemy depth. Minimum
   overkill sizing, MARGIN=0.6.

2. NON-ADJACENT path (from g3): if no beatable adjacent enemy,
   check whether Conqueror has any other adjacent move (empty
   tile, friendly with room). If yes, defer to it. If no -
   we're stalled - find the weakest beatable enemy in the 5x5
   stencil and step toward it via the dominant axis, falling
   back to the off-axis neighbor if the primary is blocked.

Tech unchanged at 90/0/2/4/4. The two paths are mutually
exclusive on entry conditions, so they compose cleanly.

Does NOT redesign target selection or sizing - this is a pure
recombination of the two best-known fixes from the lineage. If
g6 still loses to Membrane in head-to-heads, the right next move
is a sizing or wall-puncture redesign, not another fallback
addition.`,
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

    // 1) g5's hemisphere-weighted adjacent kill picker.
    let bestTile = null;
    let bestScore = -1;
    let bestNeeded = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      let friendly = false;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
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
    }

    if (bestTile) {
      army.attack(bestTile, bestNeeded);
      return;
    }

    // 2) No beatable adjacent enemy. If Conqueror has any other
    //    adjacent move (empty grab or friendly with room), let it
    //    handle - that's the path g5 already used.
    let hasAdjacentMove = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasAdjacentMove = true; break; }
      let friendlyArmy = null;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendlyArmy = a; break; }
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasAdjacentMove = true;
        break;
      }
    }
    if (hasAdjacentMove) {
      Conqueror.act(army, game);
      return;
    }

    // 3) Stalled - g3's 2-deep stencil fallback. Find the weakest
    //    beatable enemy in the 5x5 and step toward it via the
    //    primary axis, falling back to the secondary axis when the
    //    primary neighbor is full-friendly or otherwise blocked.
    if (!stencil) return;

    let bestPrim = -1;
    let bestSec = -1;
    let bestEnemy = Infinity;
    let bestDist = 0;
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
      if (enemy < bestEnemy || (enemy === bestEnemy && dist < bestDist)) {
        bestEnemy = enemy;
        bestDist = dist;
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
