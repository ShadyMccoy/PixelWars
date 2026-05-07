import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const ENGINE_BONUS = 1.4;
const MARGIN = 0.3;

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

function tileEnemyDefMult(armies, pid) {
  let m = 1;
  for (let k = 0; k < armies.length; k++) {
    const a = armies[k];
    if (a.player.id === pid) continue;
    const tm = a.player.techMults;
    const d = (tm && tm.def) || 1;
    if (d > m) m = d;
  }
  return m;
}

function tryCommit(army, target, sLimit, pid, myAtkMult) {
  const tArmies = target.armies;
  let friendlyArmy = null;
  let enemy = 0;
  let enemyDefMult = 1;
  for (let k = 0; k < tArmies.length; k++) {
    const a = tArmies[k];
    if (a.player.id === pid) {
      friendlyArmy = a;
    } else {
      enemy += a.strength;
      const tm = a.player.techMults;
      const d = (tm && tm.def) || 1;
      if (d > enemyDefMult) enemyDefMult = d;
    }
  }
  if (enemy > 0) {
    const effBonus = (ENGINE_BONUS * myAtkMult) / enemyDefMult;
    const needed = enemy / effBonus + MARGIN;
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

// Parent g5_171570 lost season #44 (seed=13) to Conqueror_g7_b6c861.
// g7_b6c861's distinguishing change vs the lineage is tech-aware
// kill sizing (originally from g2_083569): the engine's real
// attacker bonus on a 90/0/2/4/4 loadout is 1.4 * atk_mult ≈ 1.333,
// not 1.4, and the defender's def_mult matters too. The parent's
// hardcoded `needed = enemy / 1.4 + 0.6` over-commits ~0.3-0.5
// strength per kill against neutral defenders and *under*-commits
// against high-def opponents (Fortress-style def_mult up to 1.64),
// where it bounces off targets it should be able to beat.
//
// This descendant grafts that tech-aware sizing onto the parent
// verbatim while preserving the parent's distinguishing thesis:
// the strongest-beatable priority kill in the adjacent pass and the
// strongest-tiebreak in the 5x5 stencil fallback. The hemisphere
// backing from g7_b6c861 is intentionally NOT pulled in — that's a
// bigger architectural shift, and the cleanest single-variable test
// against the loss is "did tech-aware sizing alone close the gap on
// the parent's existing kernel?".
//
// Concretely:
//   * Priority-kill: minimum-overkill sizing now uses
//       effBonus = 1.4 * myAtkMult / enemyDefMult,
//       needed   = enemy / effBonus + 0.3.
//     Same selection rule (strongest beatable) as the parent.
//   * 5x5 fallback beatability gate is tech-scaled too, so we don't
//     pass on stencil targets we could actually kill against
//     low-def opponents. tryCommit on primary/secondary is also
//     tech-aware.
//   * MARGIN drops from 0.6 to 0.3 to match g2/g7's calibration —
//     the parent's 0.6 wastes strength that could fund the next
//     attack on the same tick chain.
//
// Tech unchanged at 90/0/2/4/4 — the lineage optimum, and every
// winner over the parent has kept it.
export default {
  name: "Conqueror_g6_91ad51",
  author: "claude",
  version: 1,
  description: "Conqueror_g5_171570 + tech-aware kill sizing from g2_083569/g7_b6c861.",
  summary: `Parent Conqueror_g5_171570 lost season #44 (seed=13) to
Conqueror_g7_b6c861. g7_b6c861's edge is structural and well-
understood — tech-aware kill sizing originally validated by
Conqueror_g2_083569. The engine's real attacker bonus on the
90/0/2/4/4 loadout is 1.4 * atk_mult ≈ 1.333, not 1.4, and the
defender's def_mult is ignored entirely by the parent's hardcoded
\`needed = enemy / 1.4 + 0.6\`. Result: ~0.3-0.5 strength wasted
per kill against neutral defenders, and bounces against high-def
opponents (def_mult up to 1.64).

This descendant grafts tech-aware sizing onto the parent
verbatim while preserving the two changes that make
Conqueror_g5_171570 distinct from its siblings: the
strongest-beatable adjacent priority kill, and the strongest-
tiebreak in the 5x5 stencil fallback (closest-first preserved).
g7_b6c861's hemisphere-weighted backing is intentionally NOT
pulled in — that's a larger architectural shift, and the cleanest
single-variable test against the loss is "did tech-aware sizing
alone close the gap on the parent's kernel?". If this loses again
to a hemisphere-weighted sibling, the next descendant should add
backing on top.

Both kill-sizing sites compute:
  effBonus = ENGINE_BONUS * myAtkMult / enemyDefMult
  needed   = enemy / effBonus + 0.3
The 5x5 beatability gate is tech-scaled too. MARGIN drops from
0.6 to 0.3 to match g2/g7's calibration.

Tech unchanged at 90/0/2/4/4: this is a pure sizing change.`,
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
    const viewer = army.player;
    const myAtkMult = (viewer.techMults && viewer.techMults.atk) || 1;

    // Priority kill: strongest beatable adjacent enemy first, with
    // tech-aware minimum overkill so the surplus stays available
    // next tick.
    let killTile = null;
    let killEnemy = -1;
    let killNeeded = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      let friendly = false;
      let enemy = 0;
      let enemyDefMult = 1;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
        const tm = a.player.techMults;
        const d = (tm && tm.def) || 1;
        if (d > enemyDefMult) enemyDefMult = d;
      }
      if (friendly || enemy <= 0) continue;
      const effBonus = (ENGINE_BONUS * myAtkMult) / enemyDefMult;
      const needed = enemy / effBonus + MARGIN;
      if (needed > sLimit) continue;
      if (enemy > killEnemy) {
        killEnemy = enemy;
        killTile = t;
        killNeeded = needed;
      }
    }
    if (killTile) {
      army.attack(killTile, killNeeded);
      return;
    }

    // No beatable adjacent enemy. Defer to Conqueror.act if any
    // other adjacent move is viable.
    let hasAdjacentTarget = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasAdjacentTarget = true; break; }
      let friendlyArmy = null;
      let hasEnemy = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else hasEnemy = true;
      }
      if (hasEnemy) continue;
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasAdjacentTarget = true;
        break;
      }
    }
    if (hasAdjacentTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Stalled — closest-first 5x5 fallback with strongest-tiebreak
    // (parent's thesis preserved). Beatability gate is tech-scaled.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestStencilEnemy = -1;
    for (let i = 0; i < 25; i++) {
      const hints = DIR_HINTS[i];
      if (hints[0] < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const enemy = -sumStrength(t.armies, viewer);
      if (enemy <= 0) continue;
      const enemyDefMult = tileEnemyDefMult(t.armies, pid);
      const effBonus = (ENGINE_BONUS * myAtkMult) / enemyDefMult;
      if (enemy / effBonus > sLimit + 0.5) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      if (dist < bestDist || (dist === bestDist && enemy > bestStencilEnemy)) {
        bestDist = dist;
        bestStencilEnemy = enemy;
        bestPrim = hints[0];
        bestSec = hints[1];
      }
    }
    if (bestPrim < 0) return;

    const primaryTarget = neighbors[bestPrim];
    if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid, myAtkMult)) return;
    if (bestSec < 0) return;
    const secondaryTarget = neighbors[bestSec];
    if (secondaryTarget) tryCommit(army, secondaryTarget, sLimit, pid, myAtkMult);
  },
};
