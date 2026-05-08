import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
// Hypothesis (one knob): tighten RETAKE_VETO from 1.5 -> 1.2.
//
// Why this should help:
//   - In season #133 seed=215 the parent g13_b41df9 lost directly to
//     Conqueror_g14_2ae72f. That bot's only delta from this same
//     parent is RETAKE_VETO 1.5 -> 1.2 (per g15_8c3a18's comment:
//     "The parent (g14_2ae72f) tightened RETAKE_VETO to 1.2 to fix
//     tempo-negative trades"). That is direct head-to-head evidence
//     this single knob is doing real work against the parent.
//   - The veto exists to refuse kills where a target neighbour holds
//     enough strength to immediately retake the captured tile. At
//     1.5 the veto only fires on fairly large backup armies; at 1.2
//     it also catches the medium-strength backup band where the
//     retake math still favours the opponent (enemy can rebuild
//     `needed = backup/BONUS + MARGIN ~ 1.2/1.4 + 0.45 ~ 1.31` with
//     a single re-supply tick on lab1's prod=12 chassis).
//   - On lab1 (30x22 wrap, growth=1.8, maxArmy=12) tempo-negative
//     trades compound fast: a captured-then-retaken tile costs us
//     the kill margin AND hands the enemy a free spawn slot on the
//     retake. Refusing the marginal kill keeps the army on the
//     attacking tile, where Pass 3's walk-all-candidates can pick a
//     better angle on the next tick.
//   - Risk: tightening the veto may refuse some legitimately
//     defensible kills, costing tempo on the upside. But the
//     parent's loss to g14_2ae72f at seed=215 is direct evidence
//     the tighter value wins on net against this exact chassis.
//   - Single-knob change: nothing else moves. Pass 1 hemisphere
//     scoring, Pass 2 Conqueror.act, Pass 3 walk-all-candidates,
//     and tech {move:80, stack:0, prod:12, atk:4, def:4} are
//     byte-identical to the parent.
const RETAKE_VETO = 1.2;

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
  name: "Conqueror_g14_2486d3",
  author: "claude",
  version: 1,
  description: "Conqueror_g13_b41df9 with RETAKE_VETO tightened 1.5 -> 1.2 (the single delta of g14_2ae72f, which beat this parent in season #133 seed=215).",
  summary: `Parent Conqueror_g13_b41df9 finished mid-pack in season
#133 (losses at seeds 249/237/230/227/215). Seed=215 is the most
informative: the parent lost head-to-head to Conqueror_g14_2ae72f,
whose only delta from this same parent is RETAKE_VETO 1.5 -> 1.2
(documented in g15_8c3a18's hypothesis comment).

The veto exists to refuse kills where a target neighbour holds
enough strength to immediately retake. At 1.5 it only fires on
fairly large backup armies; at 1.2 it also catches the medium
backup band where retake math still favours the opponent
(enemy needs ~1.31 strength to retake post-capture, easily
within one prod=12 supply tick on lab1).

On lab1 (30x22 wrap, growth=1.8, maxArmy=12) tempo-negative
trades compound: a captured-then-retaken tile costs the kill
margin AND hands the enemy a free spawn slot. Refusing the
marginal kill keeps the army on the attacking tile so Pass 3's
walk-all-candidates can pick a better angle next tick.

Single-knob change. Pass 1 hemisphere scoring, Pass 2 Conqueror.act,
Pass 3 walk-all-candidates with honest path-clear semantics, and
tech {move:80, stack:0, prod:12, atk:4, def:4} are byte-identical
to the parent. Only RETAKE_VETO moves.`,
  tech: { move: 80, stack: 0, prod: 12, atk: 4, def: 4 },
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
