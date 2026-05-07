import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

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

// Conqueror_g4 went undefeated, so this descendant only fixes one
// residual inefficiency I can identify: the 5x5 fallback's selection
// threshold (enemy/BONUS > sLimit + 0.5) is wider than tryCommit's
// actual commit gate (enemy/BONUS + 0.6 > sLimit). The 1.1-wide gap
// bites in two ways:
//
//   1. For a distance-1 stencil cell (where the stencil enemy IS the
//      commit target), a borderline target in that gap wins the
//      closest-first race, then tryCommit rejects it on actually
//      attempting the attack -- the army idles for the tick.
//   2. Worse, that borderline distance-1 win blocks a clearly-
//      beatable distance-2 enemy from ever being considered, because
//      the comparator demands `dist < bestDist` strictly. The real
//      opportunity is discarded.
//
// Tightening the selection check to enemy/BONUS + 0.6 <= sLimit (i.e.
// enemy <= (sLimit - 0.6) * BONUS) aligns selection with the commit
// gate exactly. Now every chosen target is one tryCommit will fire on,
// and the distance race is settled among targets that genuinely matter.
//
// Everything else is identical: same hasAdjacentTarget short-circuit
// to Conqueror.act, same primary/secondary axis routing, same
// closest-first ordering with weakest as tiebreak, same tryCommit,
// same tech.
export default {
  name: "Conqueror_g5_60c874",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 with 5x5 selection threshold aligned to tryCommit's actual commit gate.",
  summary: `Parent Conqueror_g4_868391 dominated season #18. The only
inefficiency I see on review is a threshold mismatch in the 5x5
fallback: selection accepts enemies with enemy/BONUS <= sLimit + 0.5,
but tryCommit only fires when enemy/BONUS + 0.6 <= sLimit. The 1.1-
wide gap matters most for distance-1 stencil cells, where the stencil
enemy IS the commit target -- a borderline pick wins the closest-
first race, tryCommit rejects on the actual attempt, and any
clearly-beatable distance-2 alternative is discarded because
bestDist=1 was already locked in.

This descendant tightens selection to exactly tryCommit's gate
(enemy <= (sLimit - 0.6) * BONUS). No borderline distance-1 picks
can hijack the comparator, so when a clearly-beatable distance-2
enemy exists it is now seen. Every selected target is one we will
commit to. The bot never picks a target the parent wouldn't have
considered; it just declines to pick targets the parent would
immediately have failed to commit to.

Conqueror.act delegation, axis routing, closest-first ordering,
tryCommit logic, BONUS, and tech are all unchanged.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;

    // Defer to Conqueror whenever any adjacent move is viable: free
    // kill, empty grab, or a friendly with room to be balanced toward.
    let hasAdjacentTarget = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasAdjacentTarget = true; break; }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (enemy > 0) {
        const needed = enemy / BONUS + 0.6;
        if (needed <= sLimit) { hasAdjacentTarget = true; break; }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasAdjacentTarget = true;
        break;
      }
    }
    if (hasAdjacentTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Stalled - look 2 deep for a beatable enemy. Closest-first
    // (weakest as tiebreak), with selection threshold matching
    // tryCommit's actual commit gate -- see header comment.
    if (!tile.stencil5 || sLimit <= 0.5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const maxEnemy = (sLimit - 0.6) * BONUS;
    if (maxEnemy <= 0) return;

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestEnemy = Infinity;
    for (let i = 0; i < 25; i++) {
      const hints = DIR_HINTS[i];
      if (hints[0] < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const enemy = -sumStrength(t.armies, viewer);
      if (enemy <= 0) continue;
      if (enemy > maxEnemy) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      if (dist < bestDist || (dist === bestDist && enemy < bestEnemy)) {
        bestDist = dist;
        bestEnemy = enemy;
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
