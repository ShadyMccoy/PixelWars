import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent used 0.6 in both the adjacent-engagement gate and tryCommit's
// per-attack sizing. With BONUS already giving 40% effective margin,
// 0.6 is a generous absolute pad — it almost never bites floating
// point and rarely bites engine resolution either. Tightening to 0.45
// keeps a meaningful epsilon against resolution-order quirks while
// (a) flipping a few more borderline adjacent enemies into "viable"
// status (so we delegate to the trusted Conqueror.act sooner instead
// of falling into stencil5 fallback) and (b) committing slightly less
// strength per stencil5 kill, leaving more in the tank for the next
// engagement. On lab1's growth-1.8/maxArmy-6 cadence the per-attack
// savings compound across the long tail of small exchanges.
const SAFETY = 0.45;

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
    const needed = enemy / BONUS + SAFETY;
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
  name: "Conqueror_g5_82140e",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g4 with the safety pad tightened from 0.6 to 0.45.",
  summary: `Parent Conqueror_g4_868391 dominated season #23 — no
recorded losses. The only obviously-tunable knob left in the design is
the absolute safety pad (0.6) that's added on top of the multiplicative
BONUS (1.4) margin in both the adjacent-engagement gate and tryCommit's
per-attack sizing. BONUS already gives ~40% effective overkill on its
own, so 0.6 of additional absolute slack is a generous belt-and-braces
choice — it almost never saves a fight that BONUS alone would lose.

Tightening to 0.45 keeps a real epsilon against the engine's resolution
order and float rounding, but recategorises a slim band of borderline
adjacent enemies as "viable" — those get handed to Conqueror.act, which
the parent already trusts. It also shaves a sliver off each stencil5
commit, leaving more strength in the tank for the next engagement on
the next tick. On a lab1 24x18 wrap match with growth 1.8 and maxArmy
6, the parent's whole edge came from compounding many small per-tick
wins; this tweak nudges the same lever a notch further in the same
direction without changing the kernel, the priority order, or the
tech.

Risks: a few borderline attacks the parent would have skipped now
fire and could lose to a defender that grew during resolution. The
0.15 reduction is small relative to typical per-army strengths (1-5)
and far smaller than a single growth tick under prod=2, so the
expected lost-fight rate stays low.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
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
        const needed = enemy / BONUS + SAFETY;
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
    let bestDist = Infinity;
    let bestEnemy = Infinity;
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
