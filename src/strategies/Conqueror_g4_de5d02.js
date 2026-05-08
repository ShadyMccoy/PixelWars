import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent used BUFFER=0.6. Conqueror_g5_b451ab beat the parent in
// season #83 seed=9 by tightening this constant to 0.45 in the same
// enemy/BONUS+MARGIN kill formula. The band [enemy/1.4+0.45,
// enemy/1.4+0.6) is full of attackPower values where the parent
// stalls but g5 actually kills, and every successful kill leaves an
// extra 0.15 strength behind on the home tile. On a long match that
// compounds — Conqueror's whole identity is "do not waste strength".
const BUFFER = 0.45;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
// Parent's RETAKE_VETO=1.8 was calibrated against a survivor of
// ~0.84 (overkill from BUFFER=0.6). With BUFFER=0.45 the survivor
// from a minimum-cost kill is ~0.63, so the "free retake" threshold
// needs to scale down by the same ratio (0.63/0.84 ≈ 0.75) to keep
// the same "strictly tempo-negative trade" semantic the parent's
// summary calls out. 1.8 * 0.75 = 1.35 ≈ 1.4 — a 1.4+ backup retakes
// a 0.63 survivor at minimum cost (1.4/1.4 ≈ 1.0 needed vs 0.63),
// netting the opponent ~0.45 free strength. Below 1.4 the trade is
// either a full miss or costs the opponent enough that the kill is
// still net-positive for us.
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

// Parent Conqueror_g3_be9a58 lost season #83 to two cousins that
// each fixed an orthogonal weakness:
//   - Conqueror_g7_0cfdd6 (seed 11, finished #1) replaced the
//     parent's score-based Pass 1 with a strongest-beatable-first
//     kill and added two-axis path-clear scoring to the 5x5 fallback.
//   - Conqueror_g5_b451ab (seed 9, finished #1) tightened the kill
//     margin from 0.6 to 0.45, picking up engagements the parent
//     stalled on and saving 0.15 strength per kill at home.
//
// g5's signal is the cleaner one to copy here: it's a one-constant
// change to the exact same kill cost formula the parent uses, and
// it's load-bearing in BOTH Pass 1 (adjacent kills) and Pass 3 (5x5
// fallback). g7's structural changes are larger surgery; trying to
// merge them risks regressing the retake-veto behavior that the
// parent's lineage relies on. Save that for a future descendant.
//
// The single change here: BUFFER 0.6 -> 0.45, with RETAKE_VETO
// rescaled 1.8 -> 1.4 to preserve the "skip strictly tempo-negative
// trades" guarantee that the parent's veto provides. Everything
// else — the three-pass structure, retake-aware scoring weights,
// stalemate fallback, tech — is unchanged.
//
// Tech is unchanged from the parent: {move:90, stack:0, prod:2,
// atk:4, def:4} - the shared optimum across the winning Conqueror
// cousin lineage (parent, g5, g7 all run identical tech).
export default {
  name: "Conqueror_g4_de5d02",
  author: "claude",
  version: 1,
  description: "Conqueror_g3_be9a58 with g5_b451ab's tightened kill margin (0.45) and rescaled retake veto.",
  summary: `Parent Conqueror_g3_be9a58 lost season #83 to two
cousins. Conqueror_g7_0cfdd6 (seed 11) restructured Pass 1 and added
two-axis path-clear; Conqueror_g5_b451ab (seed 9) tightened the kill
margin from 0.6 to 0.45 in the same enemy/BONUS+MARGIN formula the
parent uses.

g5's win is the cleaner one to port: a single-constant change to a
formula that's load-bearing in both Pass 1 (adjacent kill) and
Pass 3 (stencil fallback). The band [enemy/1.4+0.45, enemy/1.4+0.6)
is full of attackPower values where the parent stalls but a 0.45
margin kills cleanly, and every kill also leaves an extra 0.15
strength on the home tile.

To preserve the parent's retake veto semantic, RETAKE_VETO is
rescaled from 1.8 to 1.4: with BUFFER=0.45 a minimum-cost kill
leaves a 0.63 survivor (vs 0.84 with BUFFER=0.6), so the threshold
above which a backup gets a "free retake" drops by the same ratio.
1.4 keeps the parent's promise that vetoed kills are strictly
tempo-negative.

Three-pass kernel, retake-aware scoring weights (RETAKE_W=0.8,
FRIENDLY_W=0.4), 5x5 stalemate fallback, and tech are all
unchanged from the parent. Only BUFFER and RETAKE_VETO move.`,
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

    // Pass 3: stalled. Parent's 5x5 weakest-prey fallback, with the
    // same tightened BUFFER applied to the commit cost.
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
