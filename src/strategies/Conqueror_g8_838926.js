import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const RETAKE_W = 0.8;     // parent: penalty on worst backup enemy
const FRIENDLY_W = 0.4;   // parent: reward for sticky captures
const RETAKE_VETO = 1.8;  // parent: refuse free-retake captures

// One-knob nudge from parent g7_d17330: MARGIN 0.6 -> 0.4.
//
// In season #102 seed=19 the parent finished #2 to Conqueror_g9_c703a2.
// Comparing the kernels, c703a2's only substantive numerical diff vs
// the broader lineage was MARGIN 0.6 -> 0.4 in tryCommit + the matched
// threshold in Pass 1's `needed` calc. c703a2's own commentary credits
// that single constant as the win driver — it widens the killable band
// by 0.2 strength on every cardinal evaluation, while leaving survivor
// strength at 0.4 * 1.4 = 0.56 (above the 0.5 "positive ownership"
// floor used elsewhere in the kernel).
//
// Parent g7_d17330 has its own kernel features that c703a2 doesn't:
// the backup-aware Pass 1 (RETAKE_W penalty, FRIENDLY_W reward,
// RETAKE_VETO hard skip) and the parent's walk-all-candidates Pass 3.
// Hypothesis: those features are NOT what's costing the parent —
// they're working — but the conservative MARGIN 0.6 is leaving a
// 0.2-wide band of near-parity adjacent kills on the table every
// tick. Compounding across long Membrane-style projection matches
// (lab1 30x22 wrap with growth 1.8) those refused kills are the
// difference between #2 and #1.
//
// Why not also adopt c703a2's hemisphere weighting? Because that's
// a different scoring philosophy than the parent's backup/friend
// model — mixing them collapses the attribution. This descendant
// makes the single, validated, smallest-possible change so the
// season delta is cleanly readable: same Pass 1 model, same Pass 3
// fallback, same tech, just the margin tightened.
const MARGIN = 0.4;

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
  name: "Conqueror_g8_838926",
  author: "claude",
  version: 1,
  description: "Parent g7_d17330 with MARGIN 0.6 -> 0.4 (the single kernel diff vs c703a2, who beat the parent in season #102 seed=19).",
  summary: `Parent Conqueror_g7_d17330 lost season #102 seed=19 to
Conqueror_g9_c703a2. The two kernels share most structure, but
c703a2 explicitly attributes its win to a single constant: MARGIN
0.6 -> 0.4 in the kill threshold. Lowering MARGIN widens the
killable band by 0.2 strength per cardinal eval; survivor is
0.4 * 1.4 = 0.56, still above the kernel's 0.5 positive-ownership
floor, so flip-back exposure stays bounded.

This descendant ports that one constant onto the parent's kernel
without mixing in c703a2's hemisphere weighting (different
scoring philosophy — would collapse attribution). Pass 1 keeps
the backup/friend score with RETAKE_VETO; Pass 3 keeps the
walk-all-candidates 5x5 fallback. tryCommit's MARGIN and Pass
1's needed-threshold are the only changed numbers.

Tech unchanged at 90/0/2/4/4 — the lineage shared optimum.`,
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

    // Pass 1: parent's backup-aware kill scoring (MARGIN tightened).
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

    // Pass 3: stalled. 5x5 walk-all-candidates fallback.
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
