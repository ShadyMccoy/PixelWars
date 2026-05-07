import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Stencil5 cell -> [primary dir, secondary dir]. Primary is the
// dominant-axis step (W=0, E=1, N=2, S=3); secondary is the off-axis
// step (or -1 if the cell sits on one axis). The secondary lets the
// fallback retry the off-axis neighbor when the primary one is full.
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

// Parent Conqueror_g4_868391 lost season #13 (seed 52) to its winning
// sibling Conqueror_g5_5003d1, which adopted a 3-pass structure:
// explicit strongest-first adjacent kill, then Conqueror.act, then
// the closest-first 5x5 fallback. The structural change (explicit
// pass 1) is clearly load-bearing and is preserved here verbatim.
//
// The remaining knob is the 5x5 fallback's tiebreak. Both the parent
// and g5_5003d1 use closest-first with WEAKEST as the tiebreak.
// That choice is in tension with pass 1's strongest-first philosophy:
// at equal Manhattan distance, weakest-tiebreak routes us toward the
// smallest enemy stack — often one that's already being attrited by
// some other bot — while leaving the larger nearby stack to grow.
//
// This descendant flips the stencil tiebreak to STRONGEST. At equal
// distance, route toward the bigger enemy stack: it's the one that
// would dominate next-tick exchanges if left to grow, and the one
// where Conqueror's adjacent kernel will then deliver the best return
// on attrition once we close the gap. Same 3-pass structure, same
// closest-first primary criterion, same beatability gate, same tech.
// Only the tiebreak comparator on line ~125 changes vs g5_5003d1
// (parent uses no pass 1 but the same weakest tiebreak).
export default {
  name: "Conqueror_g5_eccc35",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 with strongest-first adjacent kill and closest-first / strongest-tiebreak 5x5 fallback.",
  summary: `Parent Conqueror_g4_868391 lost the season #13 seed-52
match to its sibling Conqueror_g5_5003d1, which won by adding an
explicit strongest-first adjacent kill pass on top of the parent's
closest-first 5x5 fallback. The structural improvement is preserved
here verbatim: pass 1 picks the strongest beatable adjacent enemy,
pass 2 defers to Conqueror.act for empty-grab and friendly-balance,
pass 3 falls through to the 5x5 stencil.

The divergence is the stencil tiebreak. Both the parent and the
winning sibling break ties on WEAKEST enemy at equal Manhattan
distance, which is in tension with pass 1's strongest-first
philosophy: weakest-tiebreak routes us toward small stacks (often
already being attrited by other bots) while letting larger nearby
stacks grow unmolested. Strongest-tiebreak instead routes the army
toward the bigger threat at equal distance, denying its growth and
setting up Conqueror's adjacent kernel to start chewing through it
once we close range. Tech vector matches the proven {move:90, stack:0,
prod:2, atk:4, def:4} GA optimum shared by every winning Conqueror
cousin; the only line that differs from g5_5003d1 is the comparator
on the stencil tiebreak (>bestStrong vs <bestWeak).`,
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

    // Pass 1: strongest beatable adjacent enemy (g5_5003d1 priority,
    // proven against this parent in season #13).
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
        const needed = enemy / BONUS + 0.6;
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

    // Pass 3: full stalemate. 5x5 with closest-first selection and
    // STRONGEST-as-tiebreak (the divergence from parent / g5_5003d1).
    // Aligns the stencil routing with pass 1's threat-priority bias:
    // at equal Manhattan distance, push toward the bigger enemy.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestStrong = -1;
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
      if (dist < bestDist || (dist === bestDist && enemy > bestStrong)) {
        bestDist = dist;
        bestStrong = enemy;
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
