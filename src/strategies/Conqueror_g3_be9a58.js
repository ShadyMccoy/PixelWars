import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const BUFFER = 0.6;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.8;

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

// Parent Conqueror_g2_6b59e8 lost season #76 to three cousins
// (g6_1cded0, g6_9eb2e4, g7_31769b). The parent's structural gap is
// in adjacent-kill selection: it defers to the plain Conqueror kernel
// for any adjacent target, which means it cheerfully takes captures
// that get retaken next tick (the failure that g6_1cded0 fixed) and
// it never picks between several beatable kills (the failure that
// g7_31769b fixed). The 5x5 stalemate fallback the parent inherited
// from Stalker is fine on its own — it just needs a smarter adjacent
// pass on top.
//
// This descendant inserts g6_1cded0's retake-aware kill scoring as
// Pass 1 in front of the parent's existing structure:
//   Pass 1 - score every beatable adjacent enemy by
//            (enemy - 0.8*backup + 0.4*friend), with a hard veto
//            on captures whose worst backup neighbor >= 1.8 (with
//            minimum overkill the survivor is ~0.84 strength, and
//            a 1.8+ backup retakes for ~1.2 strength next tick —
//            tempo-negative kills are skipped, period).
//   Pass 2 - any adjacent target (empty, beatable enemy without a
//            free-retake threat, fillable friendly) -> Conqueror.act
//            handles the choice. This preserves the parent's
//            empty-grab and friendly-balance behavior.
//   Pass 3 - 5x5 weakest-beatable-enemy stalemate fallback,
//            unchanged from the parent.
//
// Tech is unchanged from the parent: {move:90, stack:0, prod:2,
// atk:4, def:4} - the shared optimum across the winning Conqueror
// cousin lineage. The high move-tech (0.6 garrison floor) means
// the bot can commit nearly its full stack to a stalker-style
// stencil step *and* still spend liberally on adjacent kills, so
// the retake-veto's "skip and let Conqueror.act decide" branch does
// not waste throughput - empty-grabs and balance moves still run.
export default {
  name: "Conqueror_g3_be9a58",
  author: "claude",
  version: 1,
  description: "Conqueror_g2_6b59e8 + g6_1cded0's retake-aware kill scoring as Pass 1.",
  summary: `Parent Conqueror_g2_6b59e8 lost season #76 to three
cousins (g6_1cded0, g6_9eb2e4, g7_31769b). The parent's gap is in
adjacent-kill selection: it defers to plain Conqueror.act for any
adjacent target, so it commits to captures that get retaken next
tick and never differentiates between several beatable kills.

The single change here is to insert g6_1cded0's proven retake-aware
kill scoring as Pass 1 in front of the parent's existing structure:
  - Score every beatable adjacent enemy by
    enemy - 0.8*worst_backup + 0.4*best_friendly_backup
  - Hard veto when worst_backup >= 1.8 (with minimum overkill the
    survivor is ~0.84, and a 1.8+ backup retakes for ~1.2 next
    tick — strictly tempo-negative).
  - If no kill survives the veto, fall through to Conqueror.act,
    which handles empty-grab and friendly-balance exactly as the
    parent does. Stalemate (no adjacent target at all) still uses
    the parent's 5x5 weakest-beatable-enemy fallback.

Tech, fallback, and overkill safety buffer are all unchanged from
the parent; the only behavioral difference is which adjacent target
gets picked, and that is exactly the lever that produced wins for
g6_1cded0 in head-to-head play against this lineage.`,
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

      // Free-retake veto: survivor ~0.84, a 1.8+ backup retakes at
      // minimum cost. Don't take these — fall through to Pass 2.
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
    // Even if Pass 1 vetoed every adjacent kill, defer to Conqueror
    // for an adjacent move — the kernel may still find a sensible
    // step the strict score did not consider.
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

    // Pass 3: stalled. Parent's 5x5 weakest-prey fallback, unchanged.
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
