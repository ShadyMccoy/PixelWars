import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.5;

// Hypothesis (one knob, tech only): extend the move->prod gradient
// one more step beyond Conqueror_g19_9533e3. New tech:
// {move:74, stack:0, prod:18, atk:4, def:4}.
//
// Why:
//   - In season #139 the parent Conqueror_g13_b41df9 (move:80,
//     prod:12) lost five tracked seeds. Two distinct tech regimes
//     beat it: (a) the high-move/low-prod camp - g9_192ea5 and
//     g9_5c4555 both run move:90/prod:2 and won seeds 233 and 211
//     respectively; (b) the high-prod camp - g19_9533e3 runs
//     move:76/prod:16 and won seed 245. The parent's middle-ground
//     prod:12 is sitting between two competitive basins.
//   - The high-prod basin is the one the parent's lineage has
//     been climbing for several generations: g13 took g10's tech
//     (prod:12) onto g12's strategy. g16_e79590 ran prod:14 and
//     beat g15. g19_9533e3 ran prod:16 and beat g18 (and beats
//     this parent, seed 245). Each season the winning prod ticks
//     up by 2. The gradient has not plateaued, only ratcheted.
//   - This descendant pushes that gradient one more step:
//     move 80->74, prod 12->18. Same magnitude shift g19 took
//     beyond g16 (78->76, 14->16). The hypothesis is a direct
//     gradient test: if prod:16 was the winning step from prod:14,
//     prod:18 should beat prod:16 by the same logic - with
//     MARGIN=0.45 burning less strength per kill, more produced
//     strength is deployable, and prod compounds harder than at
//     the older MARGIN=0.6 baseline.
//   - move:74 still saturates lab1's garrison floor (30x22 wrap,
//     maxArmy 12). The parent comment chain has been documenting
//     this saturation since g16 (move:78), and g19 ran move:76
//     successfully with no reported throttling - one more 2-point
//     trim stays inside the saturation band per the same evidence.
//   - atk/def stays symmetric 4/4: the parent's needed-strength
//     math is keyed off BONUS=1.4. Asymmetric splits (g15's 5/3,
//     g17's 4/6) underperformed in past lineage tests, and shifting
//     atk would either waste surplus on overkill or under-commit
//     and fail the kill check.
//   - Why NOT take g19's exact tech (move:76, prod:16)? That would
//     be a rename of g19 with no new information - g19 already
//     beat this parent in seed 245, so we know that point works.
//     The open question is whether the gradient continues paying
//     out at the next step.
//   - Why NOT swing to move:90/prod:2 (the g9 cluster's tech)?
//     That's a basin swap, not a one-knob nudge, and the recent
//     lineage trajectory has been climbing the prod direction.
//     Discarding the local gradient progress to bet on the
//     opposite basin is a different kind of experiment, worth
//     running in a separate descendant.
//
// Failure mode: if the prod gradient has saturated at prod:16, the
// 16->18 step is a wash on output (prod's marginal slope flattens),
// and the move 80->74 trim - the largest single-step move trim in
// the gradient run so far - finally costs garrison floor under
// heavy contention, dropping a tick of home-tile output. Bounded:
// six points moved on the prod axis, six points off move; revert
// path is clear (just bring tech back toward {move:76, prod:16}).
//
// Strategy code (Pass 1 retake-aware + hemisphere scoring + free-
// retake veto, Pass 2 Conqueror.act fallback, Pass 3 walk-all-
// candidates 5x5 stencil) is byte-identical to the parent. Only
// the tech field changes.

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
  name: "Conqueror_g14_5ae6c0",
  author: "claude",
  version: 1,
  description: "Conqueror_g13_b41df9 with one more move->prod step beyond g19_9533e3: {move:74, stack:0, prod:18, atk:4, def:4}. Strategy code unchanged.",
  summary: `Parent Conqueror_g13_b41df9 (move:80, prod:12) lost
season #139 across multiple seeds. Two distinct tech regimes did
the beating: the high-move/low-prod camp (g9_192ea5 and g9_5c4555,
both move:90/prod:2, winning seeds 233 and 211) and the high-prod
camp (g19_9533e3, move:76/prod:16, winning seed 245). The parent's
middle-ground prod:12 sits between two competitive basins.

This descendant pushes the high-prod gradient one more step:
move 80->74, prod 12->18. Same magnitude shift g19 took beyond
g16 (78->76, 14->16). The lineage has been ratcheting up prod by
about 2 points per season - g13 (prod:12) won season #134, g16
(prod:14) beat g15, g19 (prod:16) beat this parent in seed 245.
The gradient has not plateaued, only continued. With MARGIN=0.45
burning less strength per kill, more produced strength is
deployable, and prod compounds harder than at the older MARGIN=0.6
baseline. prod:18 is the next ~12% per-turn output bump in the
direction g16 and g19 already validated.

move:74 still saturates lab1's garrison floor (30x22 wrap, maxArmy
12). The parent comment chain has been documenting saturation
since g16 (move:78), and g19 ran move:76 successfully - one more
2-point trim stays inside the saturation band by the same evidence.
atk/def held at symmetric 4/4 because the needed-strength math is
keyed off BONUS=1.4 and prior asymmetric splits underperformed.

Specifically NOT testing g19's exact tech (move:76, prod:16)
because that would be a rename of g19 with no new information.
Specifically NOT swinging to move:90/prod:2 because that's a basin
swap, not a one-knob nudge, and discards the local gradient
progress.

Failure mode: if the prod gradient has saturated at prod:16, the
16->18 step is a wash on output and the move 80->74 trim - the
largest single-step move trim in the gradient run so far - finally
costs garrison floor under heavy contention. Bounded: revert path
is clear, just bring tech back toward {move:76, prod:16}.

Strategy code (Pass 1 retake-aware + hemisphere + free-retake veto,
Pass 2 Conqueror.act fallback, Pass 3 walk-all-candidates 5x5
stencil) is byte-identical to the parent. Only the tech field
changes.`,
  tech: { move: 74, stack: 0, prod: 18, atk: 4, def: 4 },
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
