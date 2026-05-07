import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const RETAKE_W = 0.8;     // parent: penalty on worst backup enemy
const FRIENDLY_W = 0.4;   // parent: reward for sticky captures
const RETAKE_VETO = 1.8;  // parent: refuse free-retake captures

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

// Parent g6_1cded0 added smart kill scoring (backup penalty,
// friendly reward, free-retake veto), but its season #56 losses
// include three games where the parent finished 4th-6th — losing
// to cousins (g7_0cfdd6, g5_fbf131) that share the same kill
// instincts but ALSO have a 5x5 stencil fallback. When no adjacent
// kill is available, the parent falls through to Conqueror.act,
// which only sees adjacent tiles. On long-tick games (348, 552,
// 308 ticks in the loss list) the parent stalls in territory it
// already cleared while cousins push toward distant enemies and
// claim more pixels.
//
// This descendant keeps the parent's full safety-aware kill scoring
// for Pass 1 (it's working — the parent still wins many games) and
// grafts on the winning cousins' walk-all-candidates 5x5 fallback
// for Pass 3. Pass 2 retains the deferred fallthrough to
// Conqueror.act when there is some adjacent move available but no
// beatable kill; only when the army is fully stalled (no friendlies
// to balance, no empty/beatable neighbors) do we engage the 5x5
// scan.
//
// The walk-all-candidates form (sort closest-first, weakest tiebreak,
// try each candidate's primary then secondary direction until one
// commits) was specifically validated by g5_fbf131's win over the
// parent. It avoids the single-pick-or-stall failure mode of
// distance-best stencils when the closest candidate's two routing
// axes both run through capped friendlies.
//
// Tech unchanged at {move:90, stack:0, prod:2, atk:4, def:4}: the
// shared optimum of every winning Conqueror cousin in this lineage.
// The reserve thesis (low garrison, high mobility) compounds with
// the new fallback — more mobile reserves means more successful
// pushes per stalled tick.
export default {
  name: "Conqueror_g7_d17330",
  author: "claude",
  version: 1,
  description: "g6 backup-aware kill + walk-all-candidates 5x5 stencil fallback for stalled positions.",
  summary: `Parent Conqueror_g6_1cded0 has solid Pass 1 kill scoring
(retake penalty 0.8, friendly reward 0.4, hard veto on backup>=1.8)
but no Pass 3 stencil fallback — it falls through to Conqueror.act
in stalls, which only sees adjacent tiles. Season #56 losses are
disproportionately long-tick games (552, 348, 308) where the
parent stalls inside cleared territory while cousins push outward.

Two layers, both proven:
  Pass 1 (kept verbatim from parent): backup-aware kill scoring
    score = enemy - 0.8 * worst_backup + 0.4 * best_friend
    skip if worst_backup >= 1.8 (free-retake veto)
  Pass 2 (kept): defer to Conqueror.act if any non-kill adjacent
    move is available
  Pass 3 (new, lifted from g5_fbf131): collect every beatable enemy
    in the 5x5 stencil, sort closest-first / weakest-tiebreak, and
    walk the list trying primary-then-secondary tryCommit until one
    succeeds. Avoids the single-pick-or-stall failure mode.

Tech unchanged at {move:90, stack:0, prod:2, atk:4, def:4}: every
winning cousin in this lineage kept it, and the new fallback
specifically rewards mobile-reserve play.`,
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

    // Pass 1: parent's backup-aware kill scoring.
    let bestTile = null;
    let bestScore = -Infinity;
    let bestNeeded = 0;
    let hasOtherAdjacent = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasOtherAdjacent = true; continue; }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendlyArmy = a; }
        else enemy += a.strength;
      }
      if (friendlyArmy) {
        if (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
          hasOtherAdjacent = true;
        }
        continue;
      }
      if (enemy <= 0) continue;
      const needed = enemy / BONUS + 0.6;
      if (needed > sLimit) continue;

      // Scan target's other cardinal neighbors for both the worst
      // enemy stack (retake threat) and the best friendly stack
      // (sticky-capture support).
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

      // Free-retake veto: survivor ~0.84, backup >= 1.8 retakes for
      // ~1.2 strength next tick. Always tempo-negative.
      if (backup >= RETAKE_VETO) continue;

      const score = enemy - RETAKE_W * backup + FRIENDLY_W * friend;
      if (score > bestScore) {
        bestScore = score;
        bestTile = t;
        bestNeeded = needed;
      }
    }

    if (bestTile) {
      army.attack(bestTile, bestNeeded);
      return;
    }

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherAdjacent) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: stalled. 5x5 walk-all-candidates fallback (g5_fbf131
    // validated this against the parent). Collect every beatable
    // stencil enemy, sort closest-first / weakest-tiebreak, walk
    // them trying primary-then-secondary tryCommit until one fires.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

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
      candidates.push(dist, enemy, hints[0], hints[1]);
    }
    if (candidates.length === 0) return;

    // Bubble-sort flat tuples (n is tiny, avoids closure allocation).
    const n = candidates.length / 4;
    for (let a = 0; a < n - 1; a++) {
      for (let b = 0; b < n - 1 - a; b++) {
        const ai = b * 4;
        const bi = ai + 4;
        const ad = candidates[ai];
        const bd = candidates[bi];
        const swap = ad > bd || (ad === bd && candidates[ai + 1] > candidates[bi + 1]);
        if (swap) {
          for (let s = 0; s < 4; s++) {
            const tmp = candidates[ai + s];
            candidates[ai + s] = candidates[bi + s];
            candidates[bi + s] = tmp;
          }
        }
      }
    }

    for (let c = 0; c < n; c++) {
      const ci = c * 4;
      const prim = candidates[ci + 2];
      const sec = candidates[ci + 3];
      const primaryTarget = neighbors[prim];
      if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
      if (sec < 0) continue;
      const secondaryTarget = neighbors[sec];
      if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
    }
  },
};
