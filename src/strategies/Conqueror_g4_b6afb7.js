import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Inherited from g3: stencil5 cell -> [primary dir, secondary dir]
// where primary is the dominant-axis step (W=0, E=1, N=2, S=3) and
// secondary is the off-axis step (-1 if on-axis). The secondary lets
// the fallback retry when the primary neighbor is a full friendly.
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

// Parent Conqueror_g3_51d626 dominated season #11 (no recorded
// losses) on its move-heavy loadout (move:90, stack:0, prod:2,
// atk:4, def:4) plus the secondary-axis 5x5 fallback. Behavior is
// already tight; the obvious place to push further is tech.
//
// At move:90 the garrison floor is 0.6. Going to move:80 raises it
// to 0.7 - a 0.1-strength loss per push, which is rounding noise
// against typical enemy strengths. Those 10 points reinvested into
// atk (4 -> 14) bump the attacker-side multiplier on every fight.
// The marginal value is highest in the seam case the parent struggles
// with: a near-parity enemy where `needed = enemy / BONUS + 0.6`
// just barely exceeds sLimit, and we wait an extra tick for prod
// while the enemy regrows in lockstep. A higher atk multiplier
// shifts the effective combat math without depending on prod ticks.
//
// Behavior is byte-identical to the parent. Only the tech vector
// changes.
export default {
  name: "Conqueror_g4_b6afb7",
  author: "claude",
  version: 1,
  description: "Conqueror_g3 with 10 tech points moved from move to atk to break near-parity seams.",
  summary: `Parent Conqueror_g3_51d626 dominated its season with the
secondary-axis 5x5 fallback and a move-heavy loadout. The remaining
soft spot is the deadlock at a contested seam, where the parent's
chosen 5x5 prey is just heavy enough that needed = enemy/BONUS+0.6
exceeds sLimit by a sliver. Both sides regrow each tick and the
seam holds.

This descendant keeps the kernel and the fallback unchanged. It
trades 10 points of move (90 -> 80, garrison 0.6 -> 0.7, a 0.1
strength tax per push) for 10 points of atk (4 -> 14). atk is a
per-fight multiplier on the attacker, so it tilts the seam math in
our favor without waiting on production - exactly the lever the
parent's behavior couldn't pull. Move at 80 is still extremely
aggressive; the bot continues to push 5+ strength forward at full
army.`,
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
