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

// Parent Conqueror_g5_f15d3e dominated season #113 (no losses
// recorded). Strategy code is a working formula - rewrite risk is
// high. The prompt explicitly flags tech as under-explored in this
// lineage, so this descendant takes the cheap, isolated lever:
// shift 2 points from def to atk. The bot's whole identity is
// offense (Pass 1 hunts beatable adjacents, Pass 3 walks toward the
// nearest beatable enemy when stalemated) - it almost never sits
// still defending. Trading def for atk amplifies the per-turn output
// that the strategy actually leans on, while def at 4 was paying
// for a posture this bot doesn't adopt.
//
// Side effect on BONUS: BONUS=1.4 is a kill-margin estimate the
// strategy uses to decide which enemies are beatable. With more
// real-engine atk, the true combat ratio rises above 1.4, so
// `needed = enemy/BONUS + 0.6` over-allocates slightly and we may
// skip a few enemies we could actually kill (false-conservative).
// Cheap to live with - the strict reading just keeps Pass 1
// commits safe, and Pass 3 still finds the next-step target.
//
// Strategy code (Pass 1 hemisphere weighting, Pass 2 fallback,
// Pass 3 stalemate stencil) is byte-for-byte from the parent.
export default {
  name: "Conqueror_g6_ee139a",
  author: "claude",
  version: 1,
  description: "g5_f15d3e with 2 def points re-allocated to atk - tech matched to the bot's offense-first behavior.",
  summary: `Parent Conqueror_g4_3fd4ce lost season #102 three times,
two to bots (Conqueror_g8_82d39b, Conqueror_g8_912a4c) that share a
single targeted change vs g4: hemisphere-weighted Pass 1 scoring.
g5_f15d3e grafted that hemisphere weighting on, dominated season
#113 with no losses, and locked in the existing tech.

This descendant keeps the strategy code byte-for-byte and re-spends
the parent's tech budget. The parent runs
  {move:90, stack:0, prod:2, atk:4, def:4}
but its three passes are pure offense - hunt the strongest beatable
adjacent enemy with hemisphere-weighted scoring (Pass 1), grab any
adjacent action (Pass 2), then in stalemate walk toward the closest
beatable enemy in the 5x5 stencil (Pass 3). It does not sit and
soak attacks; def points are spent on a posture this bot does not
adopt. Shifting 2 points def->atk amplifies the per-turn multiplier
the strategy actually exercises every kill.

Trade is small: BONUS=1.4 is a fixed kill-margin estimate, so a
slightly higher real combat ratio means we very occasionally skip
adjacent enemies we could actually beat (we read 'needed' too high).
That's false-conservative, not unsafe; commits remain solid and
Pass 3 still finds the next step. Hypothesis: the per-kill atk gain
across the season outweighs the rare skipped commit, and the
under-explored tech axis is where the cheap multiplier still lives.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 6, def: 2 },
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
