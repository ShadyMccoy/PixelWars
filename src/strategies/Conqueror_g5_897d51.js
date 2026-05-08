import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Tightened from 0.6 to 0.45. Conqueror_g5_b451ab (which beat the
// parent in season #92) made exactly this change in its inlined
// Conqueror loop and won. On lab1 the band
//   [enemy/1.4 + 0.45, enemy/1.4 + 0.6)
// is the band where the parent had enough strength to kill but
// refused to commit. 0.45 still beats float jitter (sub-0.1) and
// absorbs a small mid-tick reinforcement; only a coordinated 0.6+
// pile-on flips the kill, which is rare on a 30x22 wrap map.
const MARGIN = 0.45;

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
  name: "Conqueror_g5_897d51",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 with kill margin tightened from 0.6 to 0.45 across Pass 1 and tryCommit.",
  summary: `Parent Conqueror_g4_3fd4ce finished last in season #92,
losing (among others) to Conqueror_g5_b451ab. b451ab's whole edge
was a single number: it tightened the kill margin in its inlined
Conqueror loop from 0.6 to 0.45, picking up every fight in the band
[enemy/1.4 + 0.45, enemy/1.4 + 0.6) as a real kill instead of a
stall. That same band is exactly what the parent's Pass 1 (margin
0.6) and Pass 3 tryCommit (margin 0.6) were leaving on the floor.

This descendant keeps the parent's 3-pass chassis intact - kill ->
Conqueror.act -> 2-step stencil fallback - because g3 won season
#27 with that kernel and no recorded losses, so it isn't the
problem. The only change is MARGIN: 0.6 -> 0.45 in Pass 1's
beatability check and in tryCommit's enemy-commit check. Pass 3's
reachableEnemyOverBonus follows from MARGIN automatically, so
unreachable targets still don't crowd reachable ones.

Pass 2 (Conqueror.act) still carries its own 0.6 internally. That
is fine: Pass 2 only fires when Pass 1 returns no kill, and a
tighter Pass 1 strictly dominates a looser one. Every fight in the
new band lands in Pass 1, never in Pass 2.

Bonus: with MARGIN=0.45 we send 0.15 less strength per kill, so
0.15 more stays on the home tile every commit. Across a long match
that compounds, which is the exact behavior Conqueror's
"don't waste strength" identity was built around.

Tech is preserved (move:90 blitz). The change is a margin tweak,
not a play-style shift, and the winning sibling kept the same tech;
re-allocating here would conflate two variables.`,
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

    // Pass 1: strongest beatable adjacent enemy, with tightened margin.
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
        const needed = enemy / BONUS + MARGIN;
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

    // Pass 2: any other adjacent action viable -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. Closest beatable enemy in the 5x5
    // (tiebreak weakest), step toward it. Threshold uses the same
    // MARGIN as tryCommit so unreachable targets don't crowd in.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const reachableEnemyOverBonus = sLimit - MARGIN;

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
      if (enemy / BONUS > reachableEnemyOverBonus) continue;
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
