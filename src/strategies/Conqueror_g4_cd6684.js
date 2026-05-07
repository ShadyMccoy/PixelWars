import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const OVERKILL_MARGIN = 0.5;

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
    const needed = enemy / BONUS + OVERKILL_MARGIN;
    if (needed > sLimit) return false;
    army.attack(target, Math.max(needed, 0.55));
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

// Synthesis of two ideas the parent (Conqueror_g3_4a7a4a) and its
// season-#37 victor (Conqueror_g4_868391) each carried half of:
//
//   * Parent: pick the STRONGEST beatable adjacent enemy on the
//     kill pass (high-value capture, denies a heavy stack to the
//     opponent).
//   * Sibling that beat us: 5x5 stencil lookahead with
//     closest-first ordering when no adjacent action is viable
//     (gets the army back into adjacent-mode one tick sooner).
//
// Parent never had the stalled-state lookahead, so when it ran out
// of adjacent kills it just deferred to Conqueror.act, which routes
// by the kernel's own scoring and can wander away from the fight.
// Sibling didn't keep the strongest-beatable tiebreak — it lets
// Conqueror.act pick among adjacent kills, which prefers different
// targets. This descendant glues both passes together:
//
//   Pass 1: parent's strongest-beatable kill (with margin 0.5).
//   Pass 2: any non-kill adjacent action -> Conqueror.act.
//   Pass 3: 5x5 closest-first stencil lookahead, lifted from the
//           sibling, for the truly stalled case.
//
// Tech: parent ran {move:75, prod:2, atk:13, def:10} — atk/def-heavy
// because parent leaned on the per-fight kill bonus. Sibling that
// beat us ran {move:90, prod:2, atk:4, def:4} — pure throughput.
// Splitting the difference at {move:85, stack:0, prod:2, atk:7, def:6}
// keeps the strongest-beatable Pass 1 still feasible against most
// stacks (atk slightly below the 20-baseline costs ~8% per-fight
// power, recoverable by the lookahead reaching kills sooner) while
// dropping garrison floor from 0.75 to 0.65 — closing 2/3 of the
// throughput gap to the sibling that won the head-to-head.
export default {
  ...Conqueror,
  name: "Conqueror_g4_cd6684",
  author: "claude",
  version: 1,
  description: "Conqueror_g3 + sibling's 5x5 stalled-state lookahead, move-heavy tech.",
  summary: `Descendant of Conqueror_g3_4a7a4a that grafts on the
5x5 stencil lookahead pioneered by the sibling Conqueror_g4_868391
(the bot that beat the parent in season #37). Three-pass act:
strongest-beatable adjacent kill (parent), then Conqueror.act for
empty grabs and friendly balancing (parent), then closest-first
5x5 stencil routing for the stalled case (sibling). The parent's
real weakness in the loss recap wasn't the kill priority — it was
that once adjacent action dried up it had no tie-breaker for which
direction to move, so it deferred to Conqueror.act's kernel
scoring and sometimes wandered. The sibling's stencil pulls the
army toward the nearest beatable enemy instead. Tech moves to
{move:85, stack:0, prod:2, atk:7, def:6}: garrison 0.65 (vs
parent's 0.75), atk/def slightly below baseline. Bet: combining
the parent's high-value targeting with the sibling's spatial
tie-breaker, plus most of the sibling's throughput edge, beats
either ancestor in isolation.`,
  tech: { move: 85, stack: 0, prod: 2, atk: 7, def: 6 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    // Pass 1: strongest beatable adjacent enemy (parent's signature).
    let bestKill = null;
    let bestEnemy = -1;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      const needed = enemy / BONUS + OVERKILL_MARGIN;
      if (needed > sLimit) continue;
      if (enemy > bestEnemy) {
        bestEnemy = enemy;
        bestKill = t;
      }
    }
    if (bestKill) {
      const power = Math.max(bestEnemy / BONUS + OVERKILL_MARGIN, 0.55);
      army.attack(bestKill, power);
      return;
    }

    // Pass 2: defer to Conqueror.act if any adjacent non-kill action
    // (empty grab, friendly balance) is viable.
    let hasAdjacent = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasAdjacent = true; break; }
      let friendlyArmy = null;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendlyArmy = a; break; }
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasAdjacent = true;
        break;
      }
    }
    if (hasAdjacent) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: stalled - 5x5 closest-first lookahead for a beatable
    // enemy (lifted from sibling Conqueror_g4_868391).
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
