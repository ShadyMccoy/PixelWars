import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.5;

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

// Single-knob descendant of Conqueror_g12_f23241. Strategy code is
// byte-for-byte from the parent; only `tech` changes:
// {move:90, stack:0, prod:2, atk:4, def:4} -> {move:90, stack:0, prod:2, atk:6, def:2}.
//
// Why: the parent finished #5 of 6 in three of season #123's five
// recorded losses. One of the bots that beat it - Conqueror_g6_ee139a
// - made exactly this tech shift (2 points def -> atk) on top of
// otherwise-stable strategy code from g5_f15d3e and won. The prompt
// also explicitly flags tech as under-explored in this lineage.
//
// Why this fits THIS chassis specifically:
//   - Pass 1 hunts the highest-scored beatable adjacent enemy.
//   - Pass 2 falls through to Conqueror.act for any adjacent action.
//   - Pass 3 walks toward the closest beatable enemy in the 5x5
//     stencil, then commits via tryCommit.
// All three passes spend strength on attacks. The bot does not
// adopt a defensive posture - def:4 was paying for a stance this
// strategy never takes. Shifting two points to atk amplifies the
// per-kill output the strategy actually exercises every tick.
//
// Side effect on commit allocation: BONUS=1.4 is a fixed kill-margin
// estimate the strategy uses to decide which enemies are beatable.
// With a higher real combat ratio (atk 4 -> 6), `needed = enemy/1.4
// + MARGIN` is now slightly over-allocating - we may very
// occasionally skip an adjacent enemy we could in fact kill. That's
// false-conservative, not unsafe; commits remain solid and Pass 3
// still finds the next step. With MARGIN=0.45 (tighter than the 0.6
// used by g6_ee139a) the over-allocation gap is even smaller, so
// the precedent argument is at least as strong here.
//
// Pass 1 hemisphere weighting, retake-aware scoring with hard
// free-retake veto, MARGIN=0.45, walk-all-candidates Pass 3 - all
// preserved verbatim from g12_f23241. The only intentional delta
// is the two-point tech swap.
export default {
  name: "Conqueror_g13_036b6a",
  author: "claude",
  version: 1,
  description: "g12_f23241 with 2 def -> atk: tech matched to the bot's offense-first behavior, replicating g6_ee139a's edge.",
  summary: `Parent Conqueror_g12_f23241 finished #5 of 6 in three of
season #123's five recorded losses. One of the bots that beat the
lineage - Conqueror_g6_ee139a - applied exactly the tech shift
this descendant uses (2 points def -> atk) on top of otherwise
unchanged strategy code, and won. The prompt also flags tech as
under-explored in this lineage.

Strategy code is byte-for-byte from the parent: hemisphere-
weighted Pass-1 kill scoring (BACKING_WEIGHT=0.4), retake-aware
backup/friend terms (RETAKE_W=0.8, FRIENDLY_W=0.4) with a hard
free-retake veto (RETAKE_VETO=1.5), MARGIN=0.45 flowing through
both Pass-1 commits and Pass-3 passability, walk-all-candidates
Pass 3 with primary+secondary axes. The only delta vs the parent
is tech.

Why this chassis benefits from atk:
  Pass 1 hunts the highest-scored beatable adjacent enemy.
  Pass 2 defers to Conqueror.act for any other adjacent action.
  Pass 3 walks toward the closest beatable enemy in the 5x5
    stencil and commits.
Every pass spends strength on attacks. The bot does not adopt a
defensive posture; def:4 was paying for a stance the strategy
never takes. Trading two points to atk amplifies the per-kill
output the strategy exercises every tick.

Trade: BONUS=1.4 is a fixed kill-margin estimate, so a slightly
higher real combat ratio means we very occasionally skip an
adjacent enemy we could in fact beat (the strategy reads 'needed'
too high). False-conservative, not unsafe; commits remain solid
and Pass 3 still finds the next step. With MARGIN=0.45 (tighter
than the 0.6 g6_ee139a used) the over-allocation gap is smaller,
so the precedent argument is at least as strong here.`,
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
