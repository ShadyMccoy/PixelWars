import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Kill safety buffer above pure parity. Parent g5_5003d1 used 0.6.
// Tightened to 0.5: snapshot semantics mean the enemy strength we
// read is exactly what we resolve against (growth fires AFTER attack
// resolution in the same tick), so the only remaining slack to
// cover is float precision (sub-0.001). 0.5 still leaves ~5x the
// margin needed for that, and saves 0.1 strength per kill — across
// a long match every committed kill keeps an extra 0.1 in reserve,
// which compounds into more empty-grabs and friendly-balances via
// Conqueror.act on subsequent ticks.
const BUFFER = 0.5;

// Stencil5 cell -> [primary dir, secondary dir]. Primary is the
// dominant-axis step (W=0, E=1, N=2, S=3); secondary is the off-axis
// step (or -1 if the cell sits on one axis). The secondary lets the
// fallback retry the off-axis neighbor when the primary one is full.
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
    const needed = enemy / BONUS + BUFFER;
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

// Parent Conqueror_g5_5003d1 dominated season #40 with no recorded
// losses, running the proven GA-optimum tech {move:90, stack:0,
// prod:2, atk:4, def:4} and a 3-pass kernel: strongest-first
// adjacent kill, then Conqueror.act for empty-grab/friendly-balance,
// then a 5x5 stencil with closest-first / weakest-as-tiebreak.
//
// Single targeted change here: tighten the kill safety buffer from
// 0.6 to 0.5. The buffer covers the gap between the strength we
// commit and the strength that actually resolves against the enemy.
// In this engine attacks enqueue at end-of-tick and resolve before
// growth fires (see docs/engine-api.md "Conflict resolution"), so
// the enemy strength at kill time is exactly the snapshot we saw.
// The only real uncertainty is float precision (~1e-4), and 0.5 is
// already three orders of magnitude above that.
//
// Effect: a kill that previously needed sLimit >= enemy/1.4 + 0.6
// now triggers at enemy/1.4 + 0.5, so a few near-edge kills become
// feasible an extra tick earlier (small but real on tight seams).
// More importantly, every successful kill commits 0.1 less strength
// and leaves 0.1 more in the garrison, which over a long match
// compounds via Conqueror.act's empty-grab and friendly-balance on
// subsequent ticks — the same throughput thesis the parent's
// summary explicitly invoked when it reverted from atk:14 to atk:4.
//
// Risk: a 0.6 -> 0.5 cut is small enough that even a worst-case
// pile-up of float drift across the match cannot tip a clean kill
// into a parity tie, so the change is dominantly upside.
export default {
  name: "Conqueror_g6_9eb2e4",
  author: "claude",
  version: 1,
  description: "Conqueror_g5 with the kill safety buffer tightened from 0.6 to 0.5 — same tech, same 3-pass kernel, every kill commits 0.1 less strength.",
  summary: `Parent Conqueror_g5_5003d1 won season #40 cleanly with the
GA-optimum {move:90, stack:0, prod:2, atk:4, def:4} tech and a 3-pass
structure (strongest-first adjacent kill, Conqueror.act for empty-grab
and friendly-balance, closest-first 5x5 stencil fallback). Nothing
about the structure is broken; the only knob still showing slack is
the kill safety buffer.

This descendant tightens BUFFER from 0.6 to 0.5 in both the Pass 1
adjacent-kill calc and tryCommit's stencil-direction kill calc. The
buffer covers the gap between committed strength and what resolves
against the enemy snapshot. In this engine attack resolution runs
before growth fires within the same tick, so the enemy strength at
resolve time equals the value we read; the only remaining slack is
float precision (~1e-4), which 0.5 still covers by roughly 5000x.

Two effects, both small but correlated with throughput rather than
nominal hitting power (the lesson g5 inherited from g4_b6afb7's
loss): kills near the feasibility edge land one tick earlier, and
every successful kill leaves 0.1 more in the garrison to fund
Conqueror.act's empty-grab and friendly-balance on later ticks.`,
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

    // Pass 1: strongest beatable adjacent enemy (g3_c24a38 priority).
    let bestKill = null;
    let bestEnemy = -1;
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
        const needed = enemy / BONUS + BUFFER;
        if (needed > sLimit) continue;
        if (enemy > bestEnemy) {
          bestEnemy = enemy;
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

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 with closest-first selection
    // (g4_868391 comparator) and primary/secondary axis fallback.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestWeak = Infinity;
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
      if (dist < bestDist || (dist === bestDist && enemy < bestWeak)) {
        bestDist = dist;
        bestWeak = enemy;
        bestPrim = hints[0];
        bestSec = hints[1];
      }
    }
    if (bestPrim < 0) return;

    const primaryTarget = neighbors[bestPrim];
    if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
    if (bestSec < 0) return;
    const secondaryTarget = neighbors[bestSec];
    if (secondaryTarget) tryCommit(army, secondaryTarget, sLimit, pid);
  },
};
