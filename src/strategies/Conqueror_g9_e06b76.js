import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent g8_9d8b65 ran MARGIN=0.6. In season #115 seed=13 the
// winner was Conqueror_g6_127cef, a sibling running the same
// hemisphere-weighted Pass 1 chassis but with MARGIN=0.45. That's
// a direct head-to-head data point: the only meaningful difference
// between parent and the bot that beat it on that seed was the
// kill margin. Tightening MARGIN 0.6 -> 0.45 picks up every fight
// in the band [enemy/BONUS + 0.45, enemy/BONUS + 0.6) as an
// actual kill instead of a stall, and leaves 0.15 more strength
// in the garrison per committed kill (compounds across the game).
//
// Hypothesis: the parent's loose MARGIN was the load-bearing
// difference vs g6_127cef. Expect the descendant to pick up the
// same edge-of-band kills the winner did.
//
// All structural code (hemisphere-weighted Pass 1, path-clear
// Pass 3, tech, BACKING_WEIGHT) is unchanged - this is a
// single-constant tune, isolating MARGIN as the variable.
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;

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
  name: "Conqueror_g9_e06b76",
  author: "claude",
  version: 1,
  description: "Parent g8_9d8b65 with MARGIN tightened 0.6 -> 0.45, matching the bot that beat it head-to-head in season #115 seed=13.",
  summary: `Parent Conqueror_g8_9d8b65 lost season #115 in three
seeds. In seed=13 the winner was Conqueror_g6_127cef, a sibling
running the SAME hemisphere-weighted Pass 1 chassis (BACKING_WEIGHT
0.4 included) but with MARGIN=0.45 instead of parent's 0.6. That's
a near-controlled experiment: the kill-margin constant was the
isolated variable on that seed, and the tighter value won.

Single targeted change: MARGIN 0.6 -> 0.45 in both Pass 1 admission
and tryCommit. Pass 3 stencil reachability gate stays at the
parent's existing constant (sLimit + 0.5) - that's a separate
heuristic and changing it would muddy the test.

Effects:
  - Picks up every fight in [enemy/BONUS + 0.45, enemy/BONUS + 0.6)
    as a kill instead of a stall.
  - 0.15 more strength stays in the garrison per committed kill,
    compounding across the game.
  - 0.45 still gives ~4500x float-precision slack vs the ~1e-4
    realistic drift on summed enemy strengths, so the lower bound
    is well above any safety floor.

All other structure preserved from parent: hemisphere-weighted
Pass 1 with BACKING_WEIGHT=0.4, Pass 2 Conqueror.act fallback,
Pass 3 5x5 path-clear stencil, tech {move:80, stack:12, prod:2,
atk:3, def:3}. Tech kept on this iteration so the MARGIN signal
is isolated from the tech experiment.

If this descendant underperforms, the takeaway is either
(a) parent's stack=12 tech experiment is the real drag (winners
all run atk:4/def:4) or (b) seed=13 was variance and MARGIN was
not the load-bearing difference.`,
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

    // Pass 1: hemisphere-weighted adjacent kill picker.
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
