import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
// Hypothesis (one knob): tighten RETAKE_VETO 1.5 -> 1.2.
//
// Why this should help:
//   - Parent g13_b41df9 finished #6 of 6 in two of its five recent
//     losses (season #131 seeds 230 and 209). That isn't a mid-pack
//     stumble — it's a hard collapse, the signature of accumulating
//     tempo-negative trades over the course of long games (534 and
//     436 ticks respectively).
//   - Under MARGIN=0.45, a successful Pass-1 kill leaves the captured
//     tile defended by exactly 0.45 strength (the cushion). The
//     break-even retake threshold for an adjacent enemy backup B is
//     B * BONUS > 0.45, i.e. B > 0.32 — so essentially ANY backup
//     retakes. The VETO is therefore not "can they retake?" but
//     "do they retake for free?", measured by how much strength they
//     keep after paying ~0.32 to flip the tile back.
//   - At VETO=1.5, the veto only fires when the opponent retains
//     >= 1.18 strength after retaking. Below that — backup in the
//     [0.32, 1.5) band — we permit kills where the opponent gets
//     the tile back AND keeps enough strength to threaten a follow-up.
//     Those trades cost us `needed` (typically ~1.16) and net them a
//     tile + leftover army. On lab1's 30x22 wrap board that pattern
//     compounds: every conceded retake feeds the opponent's next
//     hemisphere backing score against us.
//   - Tightening to 1.2 refuses kills where the opponent would keep
//     >= 0.88 strength after retaking. The 1.2-1.5 band is still
//     handled by the soft RETAKE_W=0.8 penalty in the score formula,
//     so kills with strong hemisphere backing or sticky friendly
//     support can still beat out alternatives there — they just have
//     to earn it. Only the truly free-retake band (backup >= 1.2 with
//     no offsetting score) becomes unreachable.
//   - This is the same knob g12 introduced; the parent inherited
//     1.5 from g12 without retuning for the MARGIN=0.45 + tech-shift
//     world the lineage now lives in. With prod=12 buying ~10-15%
//     more deployable strength per tick, refused borderline kills
//     are cheap to defer (we'll get another shot next tick with a
//     fuller stencil); accepted bad kills are expensive.
//
// Strategy code (HEMI table, DIR_HINTS, Pass 1 / Pass 2 / Pass 3,
// tryCommit) is byte-identical to the parent. Tech is unchanged at
// {move:80, stack:0, prod:12, atk:4, def:4} — the parent's recipe
// is presumed-correct on that axis (it's what beat g12 in season
// #126, and we're not testing two things at once).
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
  name: "Conqueror_g14_2ae72f",
  author: "claude",
  version: 1,
  description: "Conqueror_g13_b41df9 with RETAKE_VETO 1.5 -> 1.2 to refuse free-retake kills under the MARGIN=0.45 cushion.",
  summary: `Parent Conqueror_g13_b41df9 finished #6 of 6 in two of its
five recent losses (season #131 seeds 230 and 209), in long games of
534 and 436 ticks. That tail-of-distribution collapse is the
signature of accumulating tempo-negative trades, not a single bad
matchup.

Under MARGIN=0.45 the captured tile is defended by exactly 0.45
strength after a kill, which means break-even retake for the
opponent fires at backup > 0.32 — essentially any backup retakes.
The veto's actual job is to refuse kills where the retake leaves the
opponent with meaningful free strength. At VETO=1.5 that band is
[0.32, 1.5), with the opponent keeping up to ~1.18 leftover after
retake; those are trades we should not be making.

Single knob: RETAKE_VETO 1.5 -> 1.2. The 1.2-1.5 band moves from
"vetoed" to "soft-penalised" via the existing RETAKE_W=0.8 term,
which lets kills with strong hemisphere backing or sticky friendly
support still go through when they earn it. Truly free retakes
(backup >= 1.2, no offsetting score) become unreachable.

The parent inherited 1.5 from g12 without retuning for the lineage's
MARGIN=0.45 + prod=12 world. With prod=12 buying ~10-15% more
deployable strength per tick, refusing a borderline kill is cheap —
the next tick the same army has a fuller stencil and another shot.

Strategy code (HEMI, DIR_HINTS, Pass 1 / Pass 2 / Pass 3, tryCommit)
is byte-identical to the parent. Tech is unchanged at
{move:80, stack:0, prod:12, atk:4, def:4} — that recipe beat g12 in
season #126 and is not being co-tested here.`,
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
