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

// Parent Conqueror_g3_be9a58 went 0/4 in season #95 (two #6 finishes,
// one #4, one #3). Among the bots that beat it, Conqueror_g11_cb02bc
// is the most informative: it carries g10's strategy code unchanged
// and rebalances tech from {90,0,2,4,4} to {80,0,0,4,16}, raising the
// def multiplier from 0.872x to 0.968x (+11% durability) at the cost
// of a small garrison giveback (0.60 -> 0.70). The spawn brief
// explicitly flags tech as historically under-explored: descendants
// almost always preserve the parent's tech and tune only strategy
// code, leaving the tech axis on the table.
//
// Strategy code is preserved bit-for-bit from parent g3. The single
// behavioral lever changed is tech, picked up from g11_cb02bc.
//
// Why this composes cleanly with parent's existing kernel:
//
//   - Pass 1's retake-aware scoring vetoes captures whose worst
//     backup neighbor >= 1.8, because the post-kill survivor
//     (~0.84 strength after BUFFER=0.6) is brittle and a 1.8+
//     backup can retake it for minimum cost. The veto is exactly
//     the kind of defensive guard that benefits most from raising
//     def: the survivor's effective durability under attack
//     scales with our def multiplier, so the worst-case the veto
//     models becomes less catastrophic. The kills that *did* pass
//     the veto also stick more reliably.
//
//   - Pass 3's stalemate fallback commits the full sLimit on a
//     5x5 weakest-prey target. That target is by definition not
//     a "free retake" position (we picked the weakest), but the
//     post-attack remainder still has to survive until next tick.
//     Better def is a direct remainder-survivability buff on the
//     same code path.
//
// The garrison giveback (0.60 -> 0.70) costs ~17% of forward
// throughput per attack, but parent's three-pass kernel reaches
// for `army.attackPower` everywhere (it does not hardcode
// strength - 1), so the floor scales automatically and the
// strategy adapts without code changes. The trade — slightly
// less per-tick offensive volume, materially more durable
// captures — is exactly the trade g11_cb02bc validated against
// this lineage.
//
// Risk: parent's Pass 1 veto threshold (1.8) was tuned against
// the lower-def baseline. With +11% def, that threshold is now
// strictly conservative — we leave kills on the table that we
// could now safely take. A future descendant should explore
// loosening RETAKE_VETO to ~2.2 to capture that headroom; this
// descendant deliberately keeps the threshold to isolate the
// tech change as the only variable.
export default {
  name: "Conqueror_g4_7ceb9c",
  author: "claude",
  version: 1,
  description: "Parent Conqueror_g3 strategy code, unchanged, with g11_cb02bc's defensive tech rebalance to {80,0,0,4,16}.",
  summary: `Parent Conqueror_g3_be9a58 went 0/4 in season #95. Among
the bots that beat it, Conqueror_g11_cb02bc is the cleanest signal:
it carries g10's strategy code verbatim and rebalances tech from
{90,0,2,4,4} to {80,0,0,4,16}, raising def from 0.872x to 0.968x
(+11% durability) for a small garrison giveback (0.60 -> 0.70). The
spawn brief explicitly flags tech as under-explored — descendants
overwhelmingly tune only strategy code — so this is a deliberate
test of the tech axis with parent's strategy held constant.

This descendant is parent g3's strategy code bit-for-bit, with the
only diff being the tech rebalance.

Why the synergy is real, not nominal:

  - Pass 1's retake veto (kill skipped when worst backup >= 1.8)
    exists precisely because the post-kill survivor at ~0.84
    strength is brittle enough that a 1.8+ backup can retake it
    for minimum cost. Raising def directly hardens that survivor,
    so the worst case the veto models becomes less catastrophic
    and surviving kills stick more reliably.

  - Pass 3's stalemate fallback commits sLimit on a weakest-prey
    target; the remainder survivability is again gated by def.

  - The 0.60 -> 0.70 garrison giveback costs ~17% of forward
    throughput, but parent reads `army.attackPower` everywhere
    (no hardcoded strength - 1), so the floor scales and the
    strategy adapts without code changes.

Risk noted, not addressed: the 1.8 veto threshold was tuned for
the lower-def baseline; with +11% def it is now strictly
conservative and could be loosened to ~2.2. Deliberately left
unchanged here to isolate tech as the only variable, mirroring
the cleanness of g11_cb02bc's parent diff.`,
  tech: { move: 80, stack: 0, prod: 0, atk: 4, def: 16 },
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
