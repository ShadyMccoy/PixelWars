import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;

// One-knob change vs g12_f23241: RETAKE_VETO 1.5 -> 2.0.
//
// Hypothesis: the hard veto is double-counting against the
// continuous RETAKE_W = 0.8 penalty. A backup of 1.5 already drags
// the score by -1.2; combined with the +0.4 * friendly support and
// the hemisphere bonus, many captures with backup in [1.5, 2.0)
// score positively but get nuked by the veto anyway. Relaxing to
// 2.0 lets the score system arbitrate: when enemy + hemisphere +
// friendly support compensate (the common case where we have our
// own backup behind the punch), the kill goes through; when they
// don't, the score is already negative and we won't pick it.
//
// Why 2.0 specifically: at backup=2.0 the RETAKE_W penalty alone
// is -1.6, which already exceeds typical adjacent enemy strengths
// (1.0-2.0) on this map. So even without a veto, captures with
// backup>=2.0 essentially never win the Pass-1 contest unless
// matched by very high friendly support. 2.0 is still a defensive
// cap (catch the absurdly retake-friendly outliers) without
// throwing away the [1.5, 2.0) band that g12 currently leaves on
// the table.
//
// Why this matters for season #125 losses: every winner that beat
// g12 ran MARGIN=0.6 with no retake veto at all (g11_755fa9,
// g6_27c4e7, g9_d891c2). g12 keeps the tighter MARGIN AND adds a
// hard veto, which is overcautious in two directions at once.
// Loosening the veto a notch nudges the kill-aggression dial
// closer to those winners while preserving g12's tight-margin
// tempo edge.
//
// Everything else - MARGIN, hemisphere, retake/friendly weights,
// Pass 2 delegation, Pass 3 stencil with multi-candidate
// iteration, and tech {move:90, stack:0, prod:2, atk:4, def:4} -
// is unchanged from the parent.
const RETAKE_VETO = 2.0;

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
  name: "Conqueror_g13_037c96",
  author: "claude",
  version: 1,
  description: "g12 with RETAKE_VETO relaxed 1.5 -> 2.0; let the continuous score arbitrate borderline retakes.",
  summary: `Parent Conqueror_g12_f23241 finished #3, #6, #4, #4, #5
across season #125. Every winner that beat the parent (g11_755fa9,
g6_27c4e7, g9_d891c2) ran MARGIN=0.6 with no retake veto at all -
g12 is overcautious in two directions at once: tighter margin AND
a hard veto on backup>=1.5.

This descendant relaxes only the veto, from 1.5 to 2.0. The
continuous RETAKE_W=0.8 penalty already drags backup=1.5 by -1.2
and backup=2.0 by -1.6, so the score system handles tempo math on
its own; the hard veto at 1.5 just clips the [1.5, 2.0) band where
hemisphere mass + friendly backup can legitimately compensate.

At backup=2.0 the penalty alone (-1.6) already exceeds typical
adjacent enemy strengths on this map, so captures past that
threshold remain effectively excluded - 2.0 is a defensive cap on
absurd outliers, not a kill license.

Everything else is unchanged: MARGIN=0.45, BACKING_WEIGHT=0.4,
RETAKE_W=0.8, FRIENDLY_W=0.4, Pass 2 Conqueror.act delegation,
Pass 3 multi-candidate stencil iteration with honest path-clear
semantics, and tech {move:90, stack:0, prod:2, atk:4, def:4}.`,
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

        const score = enemy
          + BACKING_WEIGHT * backing
          - RETAKE_W * backup
          + FRIENDLY_W * friend;
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

    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    if (!stencil) {
      Conqueror.act(army, game);
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
        v = (enemy / BONUS + MARGIN <= sLimit) ? 1 : 0;
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
      candidates.push({ prim: hints[0], sec: hints[1], dist, enemy });
    }
    if (candidates.length === 0) {
      Conqueror.act(army, game);
      return;
    }

    candidates.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      const ca = isPassable(a.prim);
      const cb = isPassable(b.prim);
      if (ca !== cb) return cb - ca;
      return a.enemy - b.enemy;
    });

    for (let c = 0; c < candidates.length; c++) {
      const cand = candidates[c];
      const primaryTarget = neighbors[cand.prim];
      if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
      if (cand.sec < 0) continue;
      const secondaryTarget = neighbors[cand.sec];
      if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
    }
    Conqueror.act(army, game);
  },
};
