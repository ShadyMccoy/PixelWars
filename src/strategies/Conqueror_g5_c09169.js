import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent used 0.6. Sibling Conqueror_g5_4c1ea4 - the bot that beat
// the parent in season #14 - dropped this to 0.4 and outranked it.
// We adopt the same reduction; rationale below.
const MARGIN = 0.4;

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

// Parent Conqueror_g4_b6afb7 finished #5 of 6 in season #14, beaten
// by sibling Conqueror_g5_4c1ea4. The sibling's only meaningful
// behavioral edit over its own parent was MARGIN 0.6 -> 0.4: at
// float precision (~1e-12 noise on enemy strengths) the 0.6 buffer
// is overkill, and 0.4 still gives 0.4 * BONUS = 0.56 effective
// surplus on the captured tile - positive ownership, small garrison.
// The 0.2 strength saved at home per kill compounds across the long
// matches where parent's losses concentrate.
//
// Parent's distinct contribution was its tech vector: 10 points
// shifted from move (90 -> 80) into atk (4 -> 14) to break the
// near-parity seams where `needed = enemy/BONUS + 0.6` just barely
// exceeds sLimit. That thesis is *complementary* to MARGIN=0.4 -
// the seam case is `enemy/BONUS + MARGIN > sLimit`, so dropping
// MARGIN to 0.4 directly opens the same seams atk:14 was reaching
// for. Stacking both levers should compound: lower threshold +
// higher attacker multiplier = more contested-frontier wins, more
// often, with the same strength budget.
//
// Also keeps parent's enemy-first stencil comparator (weakest beatable
// enemy first, distance as tiebreak). The sibling switched to
// distance-first, but enemy-first prioritizes the cleanest kills,
// which is the right bias once MARGIN is tighter and a marginal
// kill is more likely to leave us cap-vulnerable on the captured tile.
export default {
  name: "Conqueror_g5_c09169",
  author: "claude",
  version: 1,
  description: "Conqueror_g4_b6afb7 with MARGIN reduced 0.6 -> 0.4, stacked on the parent's atk-heavy seam-breaking tech.",
  summary: `Parent Conqueror_g4_b6afb7 lost season #14 to sibling
Conqueror_g5_4c1ea4. The sibling's edit was MARGIN 0.6 -> 0.4. The
parent's edit (over its own parent) was tech: 10 points from move
into atk (move:80, atk:14), aimed at the same near-parity seams
that MARGIN gates: an attack fires only when enemy/BONUS+MARGIN
<= sLimit.

Both levers point at the same chokepoint, so this descendant
combines them. Tech stays at the parent's {move:80, stack:0,
prod:2, atk:14, def:4} - higher attacker multiplier on every fight,
0.7 garrison floor (0.1 strength tax per push, rounding noise vs
realistic enemies). MARGIN drops to 0.4, opening seams the parent
couldn't crack and saving 0.2 strength per kill in the stencil
fallback path. Effective post-kill surplus is 0.4 * 1.4 = 0.56,
still positive ownership.

Kernel and 5x5 fallback unchanged; enemy-first comparator preserved
(weakest beatable enemy first, distance tiebreak) - the right bias
when MARGIN is tighter, since marginal kills leave less cushion on
the captured tile.`,
  tech: { move: 80, stack: 0, prod: 2, atk: 14, def: 4 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;

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
        const needed = enemy / BONUS + MARGIN;
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

    if (!tile.stencil5 || sLimit <= 0.5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestPrim = -1;
    let bestSec = -1;
    let bestEnemy = Infinity;
    let bestDist = 0;
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
      if (enemy < bestEnemy || (enemy === bestEnemy && dist < bestDist)) {
        bestEnemy = enemy;
        bestDist = dist;
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
