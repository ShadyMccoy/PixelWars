import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const BACKING_WEIGHT = 0.4;
// Parent g5_f15d3e used 0.6 throughout (Pass 1 + tryCommit + Pass 3
// reachability threshold). Two of the three season #104 winners with
// source - g5_b451ab and g4_de5d02 - both beat the parent by
// tightening this exact constant to 0.45 in the same enemy/BONUS+M
// kill formula. The band [enemy/1.4 + 0.45, enemy/1.4 + 0.6) is full
// of attackPower values where the parent stalls but a 0.45-margin
// kill goes through, and every kill also leaves 0.15 more strength
// behind on the home tile. On lab1 (30x22 wrap, growth 1.8,
// maxArmy 12, ~6000 ticks) that compounds across hundreds of kills
// per match - exactly the "do not waste strength" identity Conqueror
// was built around. 0.45 still absorbs sub-0.1 float jitter and a
// small mid-tick reinforcement; only a coordinated 0.6+ pile-on
// flips the kill, which is rare on this map.
//
// Replicated by two independent winners means low variance: this is
// not a coincidence, it's a real edge over the parent's 0.6.
const BUFFER = 0.45;

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
    const needed = enemy / BONUS + BUFFER;
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
  name: "Conqueror_g6_f47ef4",
  author: "claude",
  version: 1,
  description: "g5_f15d3e with the 0.6 -> 0.45 kill-margin tightening grafted from g5_b451ab/g4_de5d02.",
  summary: `Parent Conqueror_g5_f15d3e lost season #104 five times.
Two of the three winners with source (Conqueror_g5_b451ab and
Conqueror_g4_de5d02) beat the parent with a single shared change:
tightening the kill cost margin from 0.6 to 0.45 in the same
enemy/BONUS + margin formula the parent uses in Pass 1 and (via
tryCommit) Pass 3.

This descendant grafts that one constant change onto the parent
unchanged. BUFFER=0.45 picks up the band
  [enemy/1.4 + 0.45, enemy/1.4 + 0.6)
of attackPower values where the parent stalls but the tightened
version actually kills. The compounding second-order benefit is
that every successful kill leaves 0.15 more strength behind on the
home tile - a Conqueror-identity-aligned waste reduction.

Two independent winners replicating the same constant change is a
strong low-variance signal that this is the cheapest available
upgrade. The Pass 3 reachableEnemyOverBonus threshold is also
updated from sLimit-0.6 to sLimit-BUFFER so it stays consistent
with tryCommit's actual commit cost (truly unreachable targets
should never enter Pass 3 selection in the first place).

Hemisphere-weighted Pass 1 scoring, Pass 2's Conqueror fallback,
Pass 3's closest-first 5x5 stencil with two-axis fallback, and
tech are all unchanged from the parent. Tech remains the
lineage-shared optimum {move:90, stack:0, prod:2, atk:4, def:4}.`,
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
        const needed = enemy / BONUS + BUFFER;
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

    // Pass 3: full stalemate. Look 2 deep for the closest beatable
    // enemy (tiebreak weakest) and step toward it. Threshold matches
    // tryCommit's commit margin so unreachable targets don't crowd
    // reachable ones.
    if (!stencil) return;
    const reachableEnemyOverBonus = sLimit - BUFFER;

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
