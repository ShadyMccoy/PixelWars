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

// Descendant of Conqueror_g5_171570. The parent dominated season #41
// so the priority-kill core (strongest beatable adjacent enemy with
// minimum overkill, then defer to Conqueror.act if any other adjacent
// move is viable, else 5x5 stencil fallback) is preserved verbatim.
//
// Two small bets vs parent:
//
// 1) Stencil5 tiebreak flipped from STRONGEST back to WEAKEST. The
//    parent itself flagged this as an unvalidated bet against sibling
//    g5_cabbd8 (which used weakest and beat the parent's parent). The
//    closest-first priority is preserved — only ties (rare given the
//    25-cell stencil and wrap maps) flip. Weakest-tiebreak biases the
//    secondary commit toward the smaller eventual kill, which costs
//    less force when the gap is finally closed and preserves surplus
//    for future moves. Costs nothing in non-tied cases.
//
// 2) Tech diversified slightly off pure-move. Parent declares
//    90/0/2/4/4; this descendant goes 80/5/5/5/5. Move stays the
//    dominant knob (the bot's whole thesis is "get into adjacent-mode
//    one tick sooner"), but the small allocations to stack/prod/atk/def
//    add a touch of robustness against varied opponents. lab1 caps
//    maxArmy at 6 and growth is already 1.8, so the marginal gains
//    from prod/stack are modest, but not zero.
//
// Behavior is otherwise byte-identical to the parent: priority kill
// scan, deferral check, stencil5 fallback all unchanged in structure.
export default {
  name: "Conqueror_g6_8329c4",
  author: "claude",
  version: 1,
  description: "Conqueror_g5_171570 with weakest-tiebreak in stencil5 + lightly diversified tech.",
  summary: `Parent g5_171570 dominated season #41 — no losses recorded.
Two small bets here without disturbing the priority-kill core:

(1) Stencil5 fallback tiebreak flipped from strongest (parent) back
    to weakest (sibling g5_cabbd8 lineage). The parent itself called
    its strongest-tiebreak an unvalidated bet against g5_cabbd8 (the
    bot whose priority-kill patch beat their shared ancestor). The
    weakest-tiebreak biases the secondary commit toward smaller
    eventual kills, conserving force. Distance-first preserved — only
    ties flip, which fire rarely on a 25-cell stencil with wrap.

(2) Tech moved from parent's 90/0/2/4/4 to 80/5/5/5/5. Move stays
    dominant (bot's thesis is "reach adjacent-mode one tick sooner")
    but small allocations to stack/prod/atk/def add some robustness
    on lab1 (24x18 wrap, growth 1.8, maxArmy 6) where pure-move
    extremes have less return on a small bounded map.

Priority-kill scan, deferral logic, stencil5 closest-first all
unchanged from parent.`,
  tech: { move: 80, stack: 5, prod: 5, atk: 5, def: 5 },
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
    // (Unchanged from parent — validated patch across siblings.)
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

    // Stalled — closest-first 5x5 fallback with WEAKEST tiebreak
    // (flipped from parent's strongest tiebreak — see header).
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
