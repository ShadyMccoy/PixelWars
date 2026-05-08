import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.5;

// Hypothesis (one knob, one reason): graft Conqueror_g8_c3d8b0's
// no-margin kill safety net onto the parent's stalemate fallback.
//
// Why this should help:
//   - In season #128 seed=196 the parent lost to Conqueror_g8_c3d8b0,
//     whose distinguishing feature is tryNoMarginKill: a final kill
//     attempt that uses the engine-strict resolution condition
//        sLimit * BONUS * atkMult > enemy * defMult
//     instead of the parent's enemy/BONUS + MARGIN <= sLimit. There
//     is a non-empty band where MARGIN-gated tryCommit refuses but the
//     engine kill condition still succeeds (any 0 < enemy < killCeil
//     where the margin slack would have pushed `needed` over sLimit).
//   - The parent's Pass 3 candidate loop walks every beatable-with-
//     margin neighbour but, if every tryCommit fails (backup veto in
//     Pass 1 already filtered, friendly slot full, margin too tight,
//     no path-clear), it falls through to Conqueror.act and idles
//     past adjacent enemies that an engine-strict kill would flip.
//     That is a stalemate-only failure mode, exactly what
//     g8_c3d8b0's safety net was designed for.
//   - The change is structurally additive: Pass 1 (retake-aware
//     hemisphere score), Pass 2 (Conqueror.act for empty / friendly
//     top-up), the Pass 3 walk-all-candidates with honest path-clear
//     semantics, the RETAKE_VETO, the BACKING/RETAKE/FRIENDLY weights,
//     and tech are byte-identical to the parent. The new kill only
//     fires after every existing path has exhausted itself, so it
//     cannot cannibalise wins the parent already gets.
//   - atk=4 keeps atkMult well below baseline, so the killCeiling is
//     conservative; we will not steal the strength budget Pass 1 and
//     Pass 3 already account for, only catch tiles otherwise lost.
//
// Tech unchanged: parent inherits g10_cbab8a's move 80 / prod 12 mix
// and that change was validated independently of strategy. The
// addition here is strategy-only and does not rebalance the
// per-turn supply / garrison budget.

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

// Engine-strict kill on a borderline-too-strong neighbour enemy.
// Strict resolution: `sLimit * BONUS * atkMult > enemy * defMult`.
// Mixed neighbours are skipped to avoid friendly-fire reasoning;
// multi-enemy tiles use the strongest defender's defMult as the
// conservative bound. Copied from Conqueror_g8_c3d8b0 with no
// behavioural change.
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
  name: "Conqueror_g14_7d3830",
  author: "claude",
  version: 1,
  description: "Conqueror_g13_b41df9 with g8_c3d8b0's tryNoMarginKill grafted as the Pass 3 last-resort fallback.",
  summary: `Parent Conqueror_g13_b41df9 finished mid-pack in season
#128 (losses at seeds 196/182/163/147/139). The seed=196 winner was
Conqueror_g8_c3d8b0, whose distinguishing feature over its own
ancestor was tryNoMarginKill: a strict engine-condition kill
(sLimit * BONUS * atkMult > enemy * defMult) used as a stalemate
safety net.

The parent's Pass 3 walks every beatable-with-margin candidate but
falls through to Conqueror.act when every tryCommit refuses (margin
too tight, friendly full, or path-clear gating). That leaves a band
of borderline-too-strong adjacent enemies untouched even though the
engine resolution would have flipped them.

This descendant copies tryNoMarginKill verbatim from g8_c3d8b0 and
calls it once, immediately before the very last Conqueror.act
fallback in Pass 3. Pass 1 (retake-aware hemisphere/backing/friendly
score with RETAKE_VETO=1.5), Pass 2 (Conqueror.act for empty grabs
and friendly top-ups), the candidate walk itself, MARGIN=0.45,
BACKING_WEIGHT=0.4, RETAKE_W=0.8, FRIENDLY_W=0.4, and tech
{move:80, stack:0, prod:12, atk:4, def:4} are byte-identical to the
parent.

Failure mode if wrong: an over-commit on a borderline enemy whose
neighbours mid-tick reinforce. Recovery is bounded - the new path
only fires in stalemate (no Pass 1 kill, no Pass 2 other-target, no
Pass 3 candidate commit succeeded), so we are not displacing wins
the parent already gets, only catching tiles otherwise abandoned.`,
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
