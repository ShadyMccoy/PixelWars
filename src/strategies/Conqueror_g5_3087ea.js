import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const BUFFER = 0.45;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
// Parent g4_be92c1 keeps RETAKE_VETO=1.8 with BUFFER=0.45 and argues
// the veto is "at least as load-bearing as before" because the
// survivor is thinner (~0.63). But the actual loss record disagrees:
// in season #126 seed=199 the parent finished #6 of 6 and was beaten
// by sibling Conqueror_g4_de5d02, whose ONLY behavior delta from
// g4_be92c1 is rescaling RETAKE_VETO from 1.8 -> 1.4.
//
// The math says 1.4 is the right threshold for the new survivor:
//   survivor = BUFFER * BONUS = 0.45 * 1.4 = 0.63
//   for an enemy backup B with their own MARGIN=0.45 to retake:
//       needed = 0.63/1.4 + 0.45 = 0.9
//   at B=1.4 retake costs 0.9, leaves them ~0.5 residual — the
//   trade is already net-negative for us. Below B=1.4 the retake
//   either fails or their residual is small enough that the kill
//   is still net-positive for us.
//
// Parent's veto at 1.8 lets the band [1.4, 1.8) through as a
// "real commit" but those are exactly the backups that will retake
// for free under the tightened BUFFER. This is the same reasoning
// g4_de5d02's commentary spells out, and it beat the parent head-
// to-head. Single-constant change; everything else identical.
const RETAKE_VETO = 1.4;

// Stencil5 cell -> cardinal direction (W=0, E=1, N=2, S=3) of the
// dominant axis. Center cell has no direction.
const DIR_HINT = (() => {
  const out = new Array(25);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const dy = i - 2;
      const dx = j - 2;
      if (dx === 0 && dy === 0) { out[i * 5 + j] = -1; continue; }
      if (Math.abs(dx) >= Math.abs(dy)) out[i * 5 + j] = dx < 0 ? 0 : 1;
      else out[i * 5 + j] = dy < 0 ? 2 : 3;
    }
  }
  return out;
})();

export default {
  name: "Conqueror_g5_3087ea",
  author: "claude",
  version: 1,
  description: "Conqueror_g4_be92c1 with RETAKE_VETO rescaled 1.8 -> 1.4 to match BUFFER=0.45 survivor (the proven g4_de5d02 delta).",
  summary: `Parent Conqueror_g4_be92c1 lost season #126 seed=199 to
its sibling Conqueror_g4_de5d02, and that sibling's ONLY behavior
delta against the parent is rescaling RETAKE_VETO from 1.8 to 1.4.

The parent's commentary explicitly defends keeping 1.8 ("the veto
is at least as load-bearing as before; lowering it would be a
second behavior change"), but the loss record contradicts the
defense — g4_de5d02 head-to-headed the parent and won.

The math agrees with g4_de5d02:
  survivor of a min-cost kill = BUFFER * BONUS = 0.45 * 1.4 = 0.63
  for a backup B (with MARGIN=0.45) to retake: needed = 0.9
  at B=1.4 retake costs 0.9, leaves opponent ~0.5 residual —
  strictly tempo-negative for us.

The parent's RETAKE_VETO=1.8 lets the band [1.4, 1.8) of backups
through as kill targets, but those are exactly the backups that
will retake the 0.63 survivor profitably. By dropping the veto to
1.4 we filter out that tempo-negative band; everything below 1.4
remains in scope (kills there are still net-positive for us).

Single-constant change. Everything else — three-pass kernel
(retake-aware Pass 1, Conqueror Pass 2, 5x5 stalemate Pass 3),
BUFFER=0.45, RETAKE_W=0.8, FRIENDLY_W=0.4, tech — is identical
to the parent. Tech stays {move:90, stack:0, prod:2, atk:4, def:4}
because g4_de5d02 also kept this exact tech, so the A/B isolates
the veto knob.`,
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

    // Pass 1: best beatable adjacent kill with retake-aware scoring.
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
      if (enemy <= 0) {
        if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
          hasOtherTarget = true;
        }
        continue;
      }
      const needed = enemy / BONUS + BUFFER;
      if (needed > sLimit) continue;

      // Scan target's other cardinal neighbors for retake threat
      // and friendly backup (sticky-capture support).
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

      // Free-retake veto: with BUFFER=0.45 the survivor is ~0.63;
      // a 1.4+ backup retakes at minimum cost. Strictly tempo-negative.
      if (backup >= RETAKE_VETO) continue;

      const score = enemy - RETAKE_W * backup + FRIENDLY_W * friend;
      if (score > bestScore) {
        bestScore = score;
        bestKill = t;
        bestNeeded = needed;
      }
    }
    if (bestKill) {
      army.attack(bestKill, bestNeeded);
      return;
    }

    // Pass 2: any other adjacent action (empty grab, friendly
    // balance, or vetoed-kill tile) -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }
    let hasAnyAdjacentEnemy = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      for (let k = 0; k < armies.length; k++) {
        if (armies[k].player.id !== pid) { hasAnyAdjacentEnemy = true; break; }
      }
      if (hasAnyAdjacentEnemy) break;
    }
    if (hasAnyAdjacentEnemy) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: stalled. Parent's 5x5 weakest-prey fallback.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestDir = -1;
    let bestEnemy = Infinity;
    let bestDist = 0;
    for (let i = 0; i < 25; i++) {
      const dir = DIR_HINT[i];
      if (dir < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const enemy = -sumStrength(t.armies, viewer);
      if (enemy <= 0) continue;
      if (enemy / BONUS > sLimit + 0.5) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      if (enemy < bestEnemy || (enemy === bestEnemy && dist < bestDist)) {
        bestEnemy = enemy;
        bestDist = dist;
        bestDir = dir;
      }
    }
    if (bestDir < 0) return;
    const target = neighbors[bestDir];
    if (!target) return;
    const tArmies = target.armies;
    let friendlyArmy = null;
    let enemy = 0;
    for (let k = 0; k < tArmies.length; k++) {
      const a = tArmies[k];
      if (a.player.id === pid) friendlyArmy = a;
      else enemy += a.strength;
    }
    if (enemy > 0) {
      const needed = enemy / BONUS + BUFFER;
      if (needed > sLimit) return;
      army.attack(target, needed);
      return;
    }
    if (friendlyArmy) {
      if (friendlyArmy.strength >= friendlyArmy.maxStrength - 0.5) return;
      const room = friendlyArmy.maxStrength - friendlyArmy.strength;
      const power = Math.min(sLimit, room);
      if (power > 0.5) army.attack(target, power);
      return;
    }
    army.attack(target, sLimit);
  },
};
