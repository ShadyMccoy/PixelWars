import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

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

// Descendant of Conqueror_g6_8329c4. Parent dominated season #53 with
// no losses recorded, so the priority-kill core, deferral check, and
// stencil5-with-weakest-tiebreak fallback are preserved verbatim.
//
// One small bet vs parent: tech recommitted toward move-heavy.
// Parent went 80/5/5/5/5 (a hedge against pure-move). Grandparent
// g5_171570 ran 90/0/2/4/4 and also dominated. Without head-to-head
// data on whether 80 or 90 is better, this descendant pushes back
// toward 90/2/2/3/3 — a touch more move than grandparent (more
// committed to the "reach adjacent-mode one tick sooner" thesis)
// while retaining trace stack/prod/atk/def for residual robustness.
//
// Why this is plausible on lab1 (24x18 wrap, growth 1.8, maxArmy 6):
//   - maxArmy=6 caps stack returns; the multiplier on a low cap
//     buys little. Dropping stack from 5 to 2 costs almost nothing.
//   - growth=1.8 is already aggressive; prod multiplier matters less.
//   - move directly determines garrison floor. tech=90 → garrison=0.6;
//     tech=80 → garrison=0.7. That extra 0.1 strength per attack
//     compounds across many attacks per match — the bot's hot loop is
//     priority-kill and stencil-walk, both of which call attack().
//   - atk/def kept marginally above 0 (3/2) so combat outcomes don't
//     degrade against bots that have invested in those knobs.
//
// Behavior is byte-identical to parent. Only the tech field changes.
export default {
  name: "Conqueror_g7_b36709",
  author: "claude",
  version: 1,
  description: "Conqueror_g6_8329c4 with tech recommitted to move-heavy 90/2/2/3/3.",
  summary: `Parent g6_8329c4 dominated season #53 — no losses recorded.
The priority-kill core (strongest beatable adjacent enemy with
minimum overkill, deferral to Conqueror.act when other adjacent
moves are viable, stencil5 closest-first with weakest-tiebreak
otherwise) is preserved byte-identical.

Single bet here: tech moved from parent's 80/5/5/5/5 to 90/2/2/3/3.
Grandparent g5_171570 ran 90/0/2/4/4 and also dominated, so 90 on
move is a known-good baseline. Parent's diversification to 80 was
a hedge with no clean data showing it helped. This descendant pushes
back toward the move-heavy split that aligns with the bot's whole
thesis ("get into adjacent-mode one tick sooner") while keeping
trace stack/prod/atk/def for residual combat resilience.

On lab1 specifically (24x18 wrap, growth 1.8, maxArmy 6):
  - maxArmy=6 caps stack returns hard.
  - growth 1.8 is already fast; prod multiplier is low-leverage.
  - move tech directly lowers the garrison floor (1.5 - 0.01*tech),
    so 90 vs 80 yields garrison 0.6 vs 0.7. Per attack that's an
    extra 0.1 strength projected forward; across the many attacks
    the priority-kill scan and stencil walk make per match, the
    cumulative force-projection edge is the right kind of bet for
    a bot whose core thesis is aggressive frontier expansion.

If this descendant underperforms, the verdict is that the parent's
defensive diversification (5/5/5/5 floor) was actually loadbearing
on lab1, and future lineages should retreat from pure-move.`,
  tech: { move: 90, stack: 2, prod: 2, atk: 3, def: 3 },
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

    // Priority kill: strongest beatable adjacent enemy first, with
    // minimum overkill so the surplus stays available next tick.
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
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      const needed = enemy / BONUS + 0.6;
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

    // Stalled — closest-first 5x5 fallback with weakest-tiebreak.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestStencilEnemy = Infinity;
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
      if (dist < bestDist || (dist === bestDist && enemy < bestStencilEnemy)) {
        bestDist = dist;
        bestStencilEnemy = enemy;
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
