import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent g3_be9a58 used BUFFER=0.6. Both bots that beat the parent in
// season #97 (Conqueror_g8_1c5660 and Conqueror_g6_b70bfa, both
// winners of seeds in which the parent landed in the bottom half)
// agree on the same single delta against this lineage: tighten the
// kill margin from 0.6 to 0.45. That picks up every fight in
//   [enemy/1.4 + 0.45, enemy/1.4 + 0.6)
// as a real commit instead of a stall — the band where the parent
// currently has enough strength but refuses to break the tile.
//
// 0.45 still beats float jitter (sub-0.1) and absorbs a small mid-
// tick reinforcement; only a coordinated 0.6+ pile-on flips the
// kill, which is rare on lab1 (30x22 wrap, growth 1.8). Bonus: with
// MARGIN=0.45 we send 0.15 less strength per commit, so 0.15 more
// strength stays on the home tile each tick — compounds across a
// long match in line with Conqueror's "don't waste strength" thesis.
const BUFFER = 0.45;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
// Retake-veto stays at 1.8. The survivor is now thinner
// (BUFFER*BONUS = 0.63 vs the parent's 0.84), so a 1.8 backup
// retakes for even more residual strength — the veto is at least
// as load-bearing as before; lowering it would be a second
// behavior change and this descendant is deliberately a single
// A/B against the parent on the margin lever alone.
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

export default {
  name: "Conqueror_g4_be92c1",
  author: "claude",
  version: 1,
  description: "Conqueror_g3_be9a58 with kill margin tightened from 0.6 to 0.45 (matches the winning delta from g8_1c5660 and g6_b70bfa).",
  summary: `Parent Conqueror_g3_be9a58 lost season #97 in three of
its rounds, including to Conqueror_g8_1c5660 (seed=29) and twice
to Conqueror_g6_b70bfa (seeds 17 and 1). Those two cousins were
the parent's two clearest losses, and they agree on a single
behavior delta against this lineage:

  parent BUFFER  = 0.6
  winners MARGIN = 0.45

Both winners independently rediscovered that Conqueror_g5_897d51's
0.45 margin is the operative tuning against the move=90 lineage on
lab1 — it picks up every kill in [enemy/1.4 + 0.45, enemy/1.4 +
0.6) as a real commit instead of a stall. The parent currently
abandons that band in Pass 1 and (via the inherited Pass 3
fallback) in stalemate too.

This descendant changes exactly one constant: BUFFER 0.6 -> 0.45.
Everything else is identical to the parent:

  Pass 1 - retake-aware kill scoring
           (enemy - 0.8*backup + 0.4*friend), hard veto when worst
           backup >= 1.8. The veto is preserved; with the tighter
           margin the survivor is now ~0.63 (vs 0.84), so a 1.8+
           backup is still strictly tempo-negative.
  Pass 2 - Conqueror.act for any other adjacent action.
  Pass 3 - 5x5 weakest-beatable-enemy stalemate fallback. tryCommit
           equivalent inline; same margin tightening applies so
           Pass 3 commits in the same band Pass 1 does.

Tech is unchanged: {move:90, stack:0, prod:2, atk:4, def:4}. The
parent's losses were about which adjacent target gets killed,
not allocation; both winning cousins kept the same blitz tech.

This is deliberately the smallest possible change that addresses
the documented loss pattern - one constant, two siblings already
proved it works against this exact lineage.`,
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

      // Free-retake veto: with tightened BUFFER survivor is ~0.63,
      // a 1.8+ backup retakes at minimum cost. Don't take these —
      // fall through to Pass 2.
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

    // Pass 3: stalled. Parent's 5x5 weakest-prey fallback. The
    // BUFFER=0.45 margin applies here too, so the stencil pass
    // commits to the same expanded band of beatable kills.
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
