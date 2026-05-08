import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent g7_efa4e0 used MARGIN=0.6. The bot that beat it directly
// (Conqueror_g5_897d51, season #96 seed=26) was a sibling on the
// same tech that did one thing differently: MARGIN=0.45. That tighter
// margin picks up every kill in the band
//   [enemy/1.4 + 0.45, enemy/1.4 + 0.6)
// where the parent had enough strength but refused to commit.
// 0.45 still beats float jitter (sub-0.1) and absorbs a small
// mid-tick reinforcement; only a coordinated 0.6+ pile-on flips the
// kill, which is rare on lab1 (30x22 wrap, growth 1.8). Bonus: with
// MARGIN=0.45 we send 0.15 less strength per kill, so 0.15 more
// strength stays on the home tile per commit — compounds across a
// long match in line with Conqueror's "don't waste strength" thesis.
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
  name: "Conqueror_g8_1c5660",
  author: "claude",
  version: 1,
  description: "Conqueror_g7_efa4e0 with kill margin tightened from 0.6 to 0.45 (matches g5_897d51's winning delta).",
  summary: `Parent Conqueror_g7_efa4e0 lost season #96 to several
cousins, including Conqueror_g5_897d51 in seed=26 (parent finished
#3 of 6, 897d51 won). 897d51 is a sibling on the same tech
{move:90, stack:0, prod:2, atk:4, def:4} whose only edge over the
parent's lineage is a single number: it tightened MARGIN from 0.6
to 0.45 across Pass 1 and tryCommit, picking up every fight in the
band [enemy/1.4 + 0.45, enemy/1.4 + 0.6) as a real kill instead of
a stall. The parent currently leaves that band on the floor in
both Pass 1 and the Pass-3 tryCommit.

This descendant fuses the two independent improvements that have
already proven themselves against this lineage:

  Pass 1 (kill priority): unchanged from parent g7_efa4e0 -
    hemisphere-weighted threat scoring, score = enemy +
    0.4 * sum_of_enemy_strength_in_target_direction's_5x5_hemisphere.
    Beatability check now uses MARGIN=0.45 instead of 0.6, so
    kills in the previously-missed band become actionable.

  Pass 2 (fallback): unchanged - Conqueror.act handles other
    adjacent action.

  Pass 3 (stalemate): unchanged structure from parent g7 -
    distance-first, path-clear tiebreak, weakness as final
    tiebreak. tryCommit's enemy-commit margin is now 0.45 to
    match Pass 1; the stencil scan's reachability threshold
    (enemy/BONUS > sLimit + 0.5) stays loose because that pass is
    direction selection (move toward future-reachable enemies),
    not commit.

The hemisphere weighting refines WHICH adjacent enemy to break
(parent g7's investment); the tighter margin refines WHEN to
commit (g5_897d51's investment). They operate on independent
levers and stack cleanly. Direct head-to-head evidence: 897d51
beat the parent in season #96.

Tech is preserved. The parent's losses were about target
selection and commit threshold, not allocation; both winning
siblings kept move=90 blitz.`,
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
        const score = enemy + BACKING_WEIGHT * backing;
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
