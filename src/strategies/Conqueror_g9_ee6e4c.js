import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.4;
// Hemisphere-weighted enemy backing. 0.4 matches the value
// Conqueror_g9_fd075f used to beat parent in season #93 seed=30.
const BACKING_WEIGHT = 0.4;

// Hemisphere indices for the 5x5 stencil. W=0, E=1, N=2, S=3 -> the
// stencil cells on that side, with axis cells excluded so hemispheres
// don't overlap. Used to score "how much enemy mass is backing this
// adjacent enemy" so we kill the most-dangerous one first.
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

// No-margin kill, preserved verbatim from parent g8. Final safety net
// when every neighbor is either a too-strong enemy or a full friendly:
// spend full sLimit on the weakest "too strong" pure-enemy neighbor.
// Strict kill threshold: sLimit * BONUS * atkMult > enemy * defMult.
function tryNoMarginKill(army, neighbors, sLimit, pid) {
  if (sLimit <= 0.5) return;
  const myMults = army.player.techMults;
  const atkMult = (myMults && myMults.atk) || 1;
  const effBonus = BONUS * atkMult;
  let best = null;
  let bestEnemy = Infinity;
  for (let i = 0; i < 4; i++) {
    const t = neighbors[i];
    if (!t) continue;
    const tArmies = t.armies;
    if (tArmies.length === 0) continue;
    let enemy = 0;
    let mixed = false;
    let maxDef = 1;
    for (let k = 0; k < tArmies.length; k++) {
      const a = tArmies[k];
      if (a.player.id === pid) {
        mixed = true;
        continue;
      }
      enemy += a.strength;
      const dm = (a.player.techMults && a.player.techMults.def) || 1;
      if (dm > maxDef) maxDef = dm;
    }
    if (enemy <= 0) continue;
    if (mixed) continue;
    const killCeiling = (sLimit * effBonus) / maxDef - 0.05;
    if (enemy >= killCeiling) continue;
    if (enemy < bestEnemy) {
      bestEnemy = enemy;
      best = t;
    }
  }
  if (best) army.attack(best, sLimit);
}

// Parent g8_174911 lost both season-#93 games it played:
//   * seed=30 -> Conqueror_g9_fd075f won. fd075f scores adjacent
//     kills as `enemy + 0.4 * hemisphere_enemy_backing` and has NO
//     defensive guard.
//   * seed=9  -> Conqueror_g5_b451ab won. b451ab uses Trinity 5x5
//     alignment kernels and MARGIN 0.45.
//
// Both winners run tech 90/0/2/4/4 (parent does too), so tech is
// not the lever. The lever is the kill-priority signal and the
// defensive guard.
//
// Two specific changes from parent g8:
//
// 1. SCORING: friendly-reach -> hemisphere enemy-backing.
//    Parent's `enemy + 0.5 * adjacent_friendly_mass` favors kills
//    that are well-supported from behind. Winner fd075f's
//    `enemy + 0.4 * hemisphere_enemy_backing` favors killing the
//    adjacent enemy that has the most enemy mass behind it -- the
//    one whose removal most disrupts an incoming push. The
//    head-to-head loss says fd075f's signal targets better.
//
// 2. DROP defensive guard `(maxOther - 1) * BONUS < remaining`.
//    The guard refuses kills when a non-target cardinal could
//    counter-attack with enough effective strength to break the
//    remainder. Winner fd075f has no such guard and still won.
//    On a 30x22 wrap board with frequent multi-front contact, the
//    guard trips often and costs productive kills; the worst-case
//    "all non-target enemies pile onto our remainder" rarely
//    materializes in one tick because the engine resolves
//    pairwise.
//
// Preserved: MARGIN=0.4, tech 90/0/2/4/4, g8's no-margin stall-
// breaker (which fd075f does NOT have -- a strict superset on the
// stalemate path).
export default {
  name: "Conqueror_g9_ee6e4c",
  author: "claude",
  version: 1,
  description: "g8 with hemisphere enemy-backing kill score (from g9_fd075f) replacing friendly-reach, defensive guard removed; g8's no-margin stall-breaker kept.",
  summary: `Parent Conqueror_g8_174911 lost both tracked season-#93
games. Winner #1 was Conqueror_g9_fd075f, which scores adjacent
kills by `+"`enemy + 0.4 * hemisphere_enemy_backing`"+` and has no
defensive guard. Winner #2 was Conqueror_g5_b451ab, which uses
Trinity 5x5 alignment kernels. Both run tech 90/0/2/4/4, same as
parent, so tech is not the lever.

This descendant adopts the two specific changes that distinguish
fd075f from parent on the adjacent-kill decision:

  1. Replace parent's friendly-reach signal
     (`+"`enemy + 0.5 * friendly_mass`"+`) with hemisphere
     enemy-backing (`+"`enemy + 0.4 * deep_enemy_strength`"+`),
     summing -sumStrength over the 5x5 hemisphere on the kill
     direction. Targets the adjacent enemy whose removal most
     disrupts an incoming push, instead of the one with the most
     friendly support nearby.

  2. Remove the defensive counter-attack guard. Parent skipped
     kills when `+"`(maxOther - 1) * BONUS >= remaining`"+`. fd075f
     has no such guard and beat parent. On a 30x22 wrap with
     frequent multi-front contact, the guard's worst-case
     assumption (all non-target enemies pile onto the remainder
     in one tick) rarely materializes -- the engine resolves
     pairwise.

Preserved from parent g8:
  - MARGIN = 0.4 (post-kill surplus 0.4 * 1.4 = 0.56, positive
    ownership with small garrison).
  - Tech 90/0/2/4/4 (move-heavy GA optimum across the lineage).
  - The no-margin kill stall-breaker on true standoffs -- this is
    a strict addition over fd075f, which simply returns when
    fully stalled. We instead spend sLimit on the weakest
    pure-enemy neighbor that strict-threshold-kills.
  - Mixed-owner tile skips throughout.

Risk: scoring change is a refocus, not a strict expansion -- there
will be positions where parent's friendly-reach pick was correct.
But the season-#93 head-to-head says fd075f's signal wins on net,
and dropping the guard recovers the kills that backed up parent.`,
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

    let bestTile = null;
    let bestScore = -1;
    let bestNeeded = 0;
    let hasNonStallMove = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) {
        hasNonStallMove = true;
        continue;
      }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (friendlyArmy && enemy > 0) {
        // Mixed tile -- defer to Conqueror.
        hasNonStallMove = true;
        continue;
      }
      if (friendlyArmy) {
        if (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
          hasNonStallMove = true;
        }
        continue;
      }
      // Pure-enemy tile.
      const needed = enemy / BONUS + MARGIN;
      if (needed > sLimit) continue;
      hasNonStallMove = true;

      // Hemisphere enemy-backing: how much enemy mass sits behind
      // this adjacent enemy in the 5x5 view (axis cells excluded).
      // Higher backing = bigger incoming push if not killed now.
      let backing = 0;
      if (stencil) {
        const idxs = HEMI[i];
        for (let m = 0; m < idxs.length; m++) {
          const cell = stencil[idxs[m]];
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

    if (hasNonStallMove) {
      Conqueror.act(army, game);
      return;
    }

    // True standoff: every neighbor is too-strong-enemy or
    // full-friendly. Spend the forward stack on the weakest
    // beatable-by-strict-threshold enemy.
    tryNoMarginKill(army, neighbors, sLimit, pid);
  },
};
