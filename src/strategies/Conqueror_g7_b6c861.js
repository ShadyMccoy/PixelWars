import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const ENGINE_BONUS = 1.4;
const MARGIN = 0.3;
const BACKING_WEIGHT = 0.4;

const HEMI = (() => {
  const w = [], e = [], n = [], s = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const idx = i * 5 + j;
      const dx = j - 2;
      const dy = i - 2;
      if (dx < 0) w.push(idx);
      if (dx > 0) e.push(idx);
      if (dy < 0) n.push(idx);
      if (dy > 0) s.push(idx);
    }
  }
  return [w, e, n, s];
})();

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

// Parent g6_936d2f lost season #43 in three matches:
//   seed=29 to Conqueror_g2_083569 (the tech-aware-sizing sibling)
//   seeds 26 & 4 to Conqueror_g7_31769b (g6 + path-clear tiebreak)
//
// g2_083569's edge is structural and well-understood: with the
// shared move=90/atk=4/def=4 loadout, the actual attacker bonus is
// 1.4 * atk_mult = 1.4 * 0.952 = 1.333, not 1.4. The parent's
// `needed = enemy/1.4 + 0.6` formula always covers it but
// over-commits by ~0.3-0.5 strength per kill, AND ignores the
// defender's def_mult entirely. Against a Fortress-style def-heavy
// player (def_mult up to 1.64) the parent under-commits and
// bounces off; against weak enemies it wastes strength that could
// fund the next attack. g2_083569 fixed this once already and beat
// the parent head-to-head.
//
// This descendant grafts g2's tech-aware sizing onto g6's full
// kernel (hemisphere-weighted adjacent picker + 2-deep fallback).
// Both sites that size attacks now compute:
//
//   effBonus = ENGINE_BONUS * myAtkMult / enemyDefMult
//   needed   = enemy / effBonus + 0.3
//
// myAtkMult is read once per tick. enemyDefMult is the strongest
// def_mult on the target tile (mixed-owner stacks are rare but
// possible during fights). The 0.3 margin matches g2's calibration:
// large enough to clear the engine's death-below-0.5 threshold
// after rounding, small enough to stop wasting strength.
//
// Pass 3's beatability gate (`enemy / BONUS > sLimit + 0.5`) also
// becomes tech-aware so we don't skip enemies we could actually
// kill against low-def opponents.
//
// Tech unchanged at 90/0/2/4/4 - that loadout is the lineage
// optimum and the bot beating us uses the same tech, so the
// difference is purely in sizing.
//
// Not addressed: g7_31769b's path-clear tiebreak in the stalemate
// fallback. Adding it would expand the diff; if g7_b6c861 still
// loses to g7_31769b in the next season the right next move is
// to layer that tiebreak on top.
export default {
  name: "Conqueror_g7_b6c861",
  author: "claude",
  version: 1,
  description: "Conqueror_g6_936d2f with g2_083569's tech-aware kill sizing.",
  summary: `Parent Conqueror_g6_936d2f lost season #43 to its
sibling Conqueror_g2_083569 (seed=29) and twice to
Conqueror_g7_31769b (seeds 26, 4). The g2 loss is the structural
clue: g2_083569's only behavioral change vs vanilla Conqueror is
to compute kill sizing from the actual tech multipliers in play,
and that change alone has already beaten the parent twice.

With the shared move=90/atk=4/def=4 loadout, the engine's real
attacker bonus is 1.4 * atk_mult = 1.333, not 1.4. The parent's
hardcoded \`needed = enemy / 1.4 + 0.6\` always lands the kill
but over-commits by ~0.3-0.5 strength per attack, and ignores
the defender's def_mult entirely - so against a Fortress-style
def-heavy player (def_mult up to 1.64) the parent under-commits
and bounces.

This descendant keeps g6's two-pass structure intact (Pass 1:
hemisphere-weighted adjacent kill picker; Pass 2: defer to
Conqueror.act if any other adjacent move exists; Pass 3: 2-deep
stalemate fallback with primary/secondary axis hints), and
replaces every kill-sizing site with:

  effBonus = ENGINE_BONUS * myAtkMult / enemyDefMult
  needed   = enemy / effBonus + 0.3

myAtkMult is read once per tick. enemyDefMult takes the strongest
def_mult present on the target tile. The 0.3 margin matches
g2_083569's calibration - large enough to clear post-resolution
rounding, small enough to free up strength for the next attack.
Pass 3's beatability gate is tech-scaled too, so we don't pass
on stencil targets we could actually kill against low-def
opponents.

Tech unchanged at 90/0/2/4/4: the loadout that won g2_083569 its
match is identical to the parent's, so this is a pure sizing
change rather than a tech swap. If this descendant still loses to
g7_31769b in the next season, the next move is to add g7's
path-clear tiebreak to the stalemate pass - explicitly out of
scope here to keep the diff reviewable.`,
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
    const stencil = tile.stencil5;
    const viewer = army.player;
    const myAtkMult = (viewer.techMults && viewer.techMults.atk) || 1;

    // 1) Hemisphere-weighted adjacent kill picker, tech-aware sizing.
    let bestTile = null;
    let bestScore = -1;
    let bestNeeded = 0;
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

      let backing = 0;
      if (stencil) {
        const idxs = HEMI[i];
        for (let k = 0; k < idxs.length; k++) {
          const cell = stencil[idxs[k]];
          if (!cell) continue;
          const cArmies = cell.armies;
          if (cArmies.length === 0) continue;
          const e = -sumStrength(cArmies, viewer);
          if (e > 0) backing += e;
        }
      }
      const score = enemy + BACKING_WEIGHT * backing;
      if (score > bestScore) {
        bestScore = score;
        bestTile = t;
        bestNeeded = needed;
      }
    }

    if (bestTile) {
      army.attack(bestTile, bestNeeded);
      return;
    }

    // 2) No beatable adjacent enemy. If Conqueror has any other
    //    adjacent move (empty grab or friendly with room), defer.
    let hasAdjacentMove = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasAdjacentMove = true; break; }
      let friendlyArmy = null;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendlyArmy = a; break; }
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasAdjacentMove = true;
        break;
      }
    }
    if (hasAdjacentMove) {
      Conqueror.act(army, game);
      return;
    }

    // 3) Stalled - 2-deep stencil fallback with primary/secondary
    //    axis. Beatability gate is tech-scaled so we don't skip
    //    targets we could actually kill against low-def opponents.
    if (!stencil) return;

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
      const enemyDefMult = tileEnemyDefMult(t.armies, pid);
      const effBonus = (ENGINE_BONUS * myAtkMult) / enemyDefMult;
      if (enemy / effBonus > sLimit + 0.5) continue;
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
    if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid, myAtkMult)) return;
    if (bestSec < 0) return;
    const secondaryTarget = neighbors[bestSec];
    if (secondaryTarget) tryCommit(army, secondaryTarget, sLimit, pid, myAtkMult);
  },
};
