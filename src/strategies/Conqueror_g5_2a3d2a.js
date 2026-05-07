import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Same kernel/fallback shape as Conqueror_g4_868391. The only change
// is the tech allocation: shift 10 points from move (90 -> 80) into
// atk (4 -> 14).
//
// Why: with Tech.SLOPES.move=0.0100, going from move=80 to move=90
// drops the garrison floor from 0.7 to 0.6 — only +0.1 strength of
// extra forward power per attack, ~1.85% on a 5.3-strength commit.
// Past ~tech 80 mobility is saturated for this map (lab1 24x18 wrap,
// maxArmy 6): the bot is already throwing essentially all of its
// strength forward.
//
// Atk pays better at the bottom of the curve. With SLOPES.atk=0.0030,
// the parent's atk=4 produces a 0.952 multiplier, so the engine
// resolves attacks at effective bonus 1.4 * 0.952 = 1.333 — but the
// parent's tryCommit math uses BONUS=1.4 directly, meaning every
// attack lands with ~5% less margin than the formula expects. Moving
// to atk=14 lifts the multiplier to 0.982 (mult * bonus = 1.375),
// closing more than half the gap. That's ~3.15% more damage per unit
// of attacker strength on every engagement, which compounds across
// the long exchange chains that decide lab1 matches.
//
// Net: -1.85% per-attack mobility, +3.15% per-attack damage. Same
// kernel selection. Same beatability gate. Same Conqueror.act
// delegation. The strategy code is unchanged.

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

export default {
  name: "Conqueror_g5_2a3d2a",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 with 10 tech points shifted from move to atk.",
  summary: `Parent Conqueror_g4_868391 dominated season #22 with no
recorded losses, so the strategy code stays put — kernels, beatability
gate, closest-first 5x5 fallback, Conqueror.act delegation, all of it
unchanged. The only tunable left is the tech allocation, which the
parent skewed hard toward mobility (move=90, atk=4).

The asymmetry of those two knobs is the opportunity. SLOPES.move is
0.0100 with linear garrison floor, so going from move=80 to move=90
drops the floor from 0.7 to 0.6 — just +0.1 strength of extra forward
power, ~1.85% of a typical 5.3 commit. SLOPES.atk is 0.0030, but
atk=4 sits at multiplier 0.952 while the parent's tryCommit math
plugs in BONUS=1.4 unconditionally. The engine actually resolves at
1.4 * 0.952 = 1.333, so every attack lands with ~5% less margin than
the formula assumes. Moving to atk=14 raises the multiplier to 0.982
(effective bonus 1.375), recovering more than half that gap and
adding ~3.15% damage per unit of attacker strength on every fight.

Net trade: -1.85% mobility for +3.15% per-attack damage. On a 24x18
wrap map with growth 1.8 and maxArmy 6 the matches are long chains of
small exchanges, so the per-attack gain compounds. Same kernel
selection, same beatability gate, same closest-first fallback —
nothing the parent did changes, the bot just hits a little harder.`,
  tech: { move: 80, stack: 0, prod: 2, atk: 14, def: 4 },
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
    // (weakest as tiebreak), inherited from g4.
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
