import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.5;

// Hypothesis (one knob, one reason): revert the parent's tech mix
// from {move:80, prod:12} back to the cousin-lineage optimum
// {move:90, prod:2}. Strategy code is byte-identical to the parent.
//
// Why this should help (season #130 evidence):
//   - The parent lost at five seeds. Of the four head-to-head
//     winners, the three with source files all run the SAME tech:
//       * Conqueror_g9_5c4555  (seed=247 winner) — move:90, prod:2
//       * Conqueror_g9_192ea5  (seed=244 AND seed=235 winners)
//                              — move:90, prod:2
//       * Conqueror_g9_d2499d  (seed=226 winner) — move:90, prod:2
//     The parent is the only one in its own loss lineups running
//     move:80/prod:12. That is a 4-of-4 head-to-head signal that
//     the off-trunk tech mix the parent inherited from g10_cbab8a
//     is no longer pulling its weight.
//   - The parent's summary asserts "the move 80 / prod 12 mix was
//     validated independently of strategy", but season #130 is
//     direct evidence that against the strategy mix that's
//     currently winning seasons, the (move:90, prod:2) tech is
//     ahead. Strategy and tech are not independent — high move
//     gives every newly captured tile a bigger garrison floor that
//     immediately participates in the parent's Pass 1 / Pass 3
//     attack chains, while prod compounds slowly on tiles that may
//     get retaken before the prod payoff lands.
//   - The prompt's own guidance flags tech as "historically
//     under-explored in this lineage" and notes that strategy and
//     tech "have little synergy" because descendants tune one and
//     not the other. The parent's strategy is aggression-heavy
//     (retake-aware kills, walk-all-candidates fallback,
//     tryNoMarginKill safety net) — that strategy benefits more
//     from move (= more starting strength on every newly captured
//     tile) than from prod (= slow per-turn drip on existing
//     tiles).
//   - This is structurally minimal: every line of strategy code is
//     byte-identical to Conqueror_g14_7d3830, including the
//     constants block, HEMI/DIR_HINTS precomputes, tryCommit,
//     tryNoMarginKill, and the act() body with all three passes.
//     Only the `tech` field differs. If the season disagrees, the
//     diff to revert is one object literal.
//
// Failure mode if wrong: lower per-turn strength output may make
// the parent's MARGIN=0.45 fights borderline more often, so a few
// kills the parent would have won become stalls. Recovery is that
// the change is one field; next descendant can either revert tech
// or trim MARGIN to compensate.

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

function tryNoMarginKill(army, neighbors, sLimit, pid) {
  if (sLimit <= 0.5) return false;
  const myMults = army.player.techMults;
  const atkMult = (myMults && myMults.atk) || 1;
  const effBonus = BONUS * atkMult;
  let best = null;
  let bestEnemy = Infinity;
  for (let i = 0; i < 4; i++) {
    const t = neighbors[i];
    if (!t) continue;
    const tArmies = t.armies;
    if (tArmies.length === 0) continue;
    let enemy = 0;
    let mixed = false;
    let maxDef = 1;
    for (let k = 0; k < tArmies.length; k++) {
      const a = tArmies[k];
      if (a.player.id === pid) {
        mixed = true;
        continue;
      }
      enemy += a.strength;
      const dm = (a.player.techMults && a.player.techMults.def) || 1;
      if (dm > maxDef) maxDef = dm;
    }
    if (enemy <= 0) continue;
    if (mixed) continue;
    const killCeiling = (sLimit * effBonus) / maxDef - 0.05;
    if (enemy >= killCeiling) continue;
    if (enemy < bestEnemy) {
      bestEnemy = enemy;
      best = t;
    }
  }
  if (best) {
    army.attack(best, sLimit);
    return true;
  }
  return false;
}

export default {
  name: "Conqueror_g15_9bb6eb",
  author: "claude",
  version: 1,
  description: "Conqueror_g14_7d3830 with tech reverted to the cousin-lineage optimum {move:90, prod:2} matching all three head-to-head winners in season #130.",
  summary: `Parent Conqueror_g14_7d3830 lost season #130 at five seeds.
Of the four head-to-head winners, the three with source files all
share tech {move:90, stack:0, prod:2, atk:4, def:4}:
  - Conqueror_g9_5c4555  beat the parent at seed=247
  - Conqueror_g9_192ea5  beat it at seed=244 AND seed=235
  - Conqueror_g9_d2499d  beat it at seed=226

The parent is the only bot in its own loss lineups running the
off-trunk {move:80, prod:12} mix it inherited from g10_cbab8a.
That is a 4-of-4 signal against the parent's tech.

This descendant keeps the parent's strategy code byte-identical
(retake-aware Pass 1 with RETAKE_VETO=1.5, BACKING/RETAKE/FRIENDLY
weights, the walk-all-candidates Pass 3, tryNoMarginKill safety
net, MARGIN=0.45) and only swaps the tech back to {move:90,
stack:0, prod:2, atk:4, def:4}.

Why move helps this strategy specifically: the parent's act() is
aggression-heavy — every Pass 1 / Pass 3 commit is a tile capture,
and every capture leaves a brand-new garrison whose starting
strength is the move floor. The strategy chains are throughput-
bound: more move = more strength on every just-captured tile,
which immediately participates in the next tick's Pass 1.
Prod, by contrast, only compounds on tiles that survive long
enough — fragile in a 6-bot lineup where the parent's own retake
veto is needed because tiles get retaken constantly.

The prompt explicitly flags tech as historically under-explored
in this lineage, with strategy and tech tuned in isolation. This
is the smallest possible alignment: pair the parent's strategy
advances with the tech that's been winning seasons. Failure mode:
fewer borderline kills if MARGIN=0.45 needs the higher prod
output to clear; recovery is one-field revert.`,
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
      if (tryNoMarginKill(army, neighbors, sLimit, pid)) return;
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
    if (tryNoMarginKill(army, neighbors, sLimit, pid)) return;
    Conqueror.act(army, game);
  },
};
