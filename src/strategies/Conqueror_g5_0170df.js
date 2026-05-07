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

// Parent Conqueror_g4_868391 went undefeated in season #24 with the
// closest-first stencil ordering; the kernel doesn't have any obvious
// remaining slack. The unexplored surface is the tech loadout.
//
// Parent runs { move:90, stack:0, prod:2, atk:4, def:4 } — extreme
// move investment (garrison 0.6) with combat knobs essentially flat.
// On lab1 (24x18 wrap, growth 1.8, maxArmy 6) regrowth is already
// quick, so prod is cheap to drop, and stack does nothing useful when
// maxArmy is small. The kernel routes the army into adjacent fights
// constantly via Conqueror.act, so every percent of atk/def buys
// survivor strength on each captured tile and forces fewer follow-up
// commits to clean up close calls.
//
// This descendant trades 10 points of move and the 2 points of prod
// for atk (+8) and def (+4). Garrison goes from 0.6 to 0.7 — 0.1
// strength of carry-back per move, negligible against a typical
// attackPower north of 4. Atk tech triples and def doubles, which
// matters in the long sequence of close exchanges that decides
// lab1 matches. Strategy logic, kernel, and target selection are
// byte-identical to the parent.
export default {
  name: "Conqueror_g5_0170df",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 with combat-leaning tech (atk 12 / def 8) instead of all-move.",
  summary: `Parent Conqueror_g4_868391 was undefeated in its season,
so the kernel is left untouched. The exploration surface is tech.

Parent ran { move:90, stack:0, prod:2, atk:4, def:4 }: garrison 0.6
and combat knobs near baseline. On lab1 (growth 1.8, maxArmy 6) prod
is overkill — regrowth is already fast — and stack does nothing
useful at low maxArmy. The kernel plays a long string of adjacent
exchanges through Conqueror.act, so atk and def directly translate
to surviving strength on captured tiles and fewer second-attempt
commits when an attack barely misses.

This descendant moves 10 points from move (90→80, garrison 0.7) and
2 from prod (→0) into atk (+8 → 12) and def (+4 → 8). Carry-back
goes up by 0.1 strength per move, which is rounding error against
typical attackPower; combat multipliers shift meaningfully upward.
Same target selection, same closest-first stencil tiebreak, same
tryCommit, same hasAdjacentTarget gate.`,
  tech: { move: 80, stack: 0, prod: 0, atk: 12, def: 8 },
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
