import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const REACH_WEIGHT = 0.5;
const MARGIN = 0.4;

// Direction-hint table (from Conqueror_g7_0cfdd6). For each cell of a
// 5x5 stencil, gives the [primary, secondary] cardinal direction that
// tryCommit will try in order (0=W, 1=E, 2=N, 3=S; -1 = none).
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

// Parent's verbatim no-margin kill stall-breaker.
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

// 5x5 stencil routing toward a distant beatable enemy (lifted from
// Conqueror_g7_0cfdd6's Pass 3 with its two-axis path-clear scoring).
// We only consider dist>=2 stencil targets here -- the adjacent (dist=1)
// kill decision already happened in the parent's reach-weighted scan
// at MARGIN=0.4, which is strictly more permissive than tryCommit's
// +0.6 margin, so any dist=1 candidate the scan rejected would also
// fail tryCommit. Returns true iff it issued an attack.
function tryStencilRoute(army, tile, neighbors, sLimit, pid) {
  if (!tile.stencil5) return false;
  const stencil = tile.stencil5;
  const viewer = army.player;

  const passCache = [-1, -1, -1, -1];
  const isPassable = (dir) => {
    let v = passCache[dir];
    if (v >= 0) return v;
    const n = neighbors[dir];
    if (!n) { passCache[dir] = 0; return 0; }
    const armies = n.armies;
    if (armies.length === 0) { passCache[dir] = 1; return 1; }
    let friendlyArmy = null;
    let enemy = 0;
    for (let k = 0; k < armies.length; k++) {
      const a = armies[k];
      if (a.player.id === pid) friendlyArmy = a;
      else enemy += a.strength;
    }
    if (enemy > 0) {
      v = (enemy / BONUS <= sLimit + 0.5) ? 1 : 0;
    } else if (friendlyArmy) {
      v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
    } else {
      v = 1;
    }
    passCache[dir] = v;
    return v;
  };

  let bestPrim = -1;
  let bestSec = -1;
  let bestDist = Infinity;
  let bestClear = -1;
  let bestWeak = Infinity;
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
    // Skip adjacent picks; parent's kill scan was authoritative there.
    if (dist <= 1) continue;
    const primClear = isPassable(hints[0]);
    const secClear = hints[1] >= 0 ? isPassable(hints[1]) : 0;
    const clear = primClear * 2 + secClear;
    if (
      dist < bestDist
      || (dist === bestDist && clear > bestClear)
      || (dist === bestDist && clear === bestClear && enemy < bestWeak)
    ) {
      bestDist = dist;
      bestClear = clear;
      bestWeak = enemy;
      bestPrim = hints[0];
      bestSec = hints[1];
    }
  }
  if (bestPrim < 0) return false;
  const primaryTarget = neighbors[bestPrim];
  if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return true;
  if (bestSec < 0) return false;
  const secondaryTarget = neighbors[bestSec];
  if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return true;
  return false;
}

// Parent Conqueror_g8_174911 lost season #84 to:
//   * Conqueror_g5_d70030 -- the same defensive guard the parent
//     already inherits, on a different seed.
//   * Conqueror_g7_0cfdd6 -- whose distinguishing edge is a 5x5
//     stencil fallback that routes toward distant beatable enemies
//     via a two-axis path-clear tiebreak.
//
// The first loss is a tech/seed coincidence (the parent has g5's
// guard verbatim plus more, so the strategic delta is noise). The
// second is structural: the parent has no stencil routing at all.
// Its hasNonStallMove path always defers to Conqueror.act, which
// rebalances locally with no notion of strategic intent toward a
// dist>=2 beatable target.
//
// This descendant inserts g7's stencil routing as a NEW tier between
// the parent's reach-weighted kill scan and the Conqueror.act defer,
// firing only when:
//   (a) the kill scan found NO beatable adjacent at MARGIN=0.4
//       (i.e. bestTile is null -- so we don't undo the guard), and
//   (b) hasNonStallMove is true (some adjacent action is available
//       to chain through), and
//   (c) the stencil has a dist>=2 beatable target whose primary or
//       secondary cardinal lane is currently passable.
//
// All three guards together mean: parent behaviour is byte-identical
// in every state where the parent already had a kill candidate (with
// or without guard trip), and in every state where the stencil has
// nothing strategic to bias toward. The change adds *direction* to
// what would otherwise be a Conqueror.act local rebalance -- e.g.
// reinforcing a friendly that lies on the route to a distant enemy
// instead of a friendly that doesn't, or capturing the empty cell
// pointing toward the front instead of an arbitrary one.
//
// Tech 90/0/2/4/4 preserved -- the move-heavy GA optimum across the
// entire Conqueror_g4+ lineage, unchanged from parent.
export default {
  name: "Conqueror_g9_1052df",
  author: "claude",
  version: 1,
  description: "Conqueror_g8_174911 with g7_0cfdd6's 5x5 stencil routing inserted before the Conqueror.act defer in the hasNonStallMove path.",
  summary: `Parent Conqueror_g8_174911 lost season #84 game 2 to
Conqueror_g7_0cfdd6, whose distinguishing edge over the broader
Conqueror lineage is a 5x5 stencil fallback that routes toward
distant beatable enemies with a two-axis path-clear tiebreak. The
parent has no equivalent: when its reach-weighted kill scan finds
nothing committable, it always defers to Conqueror.act, which
rebalances locally with no strategic bias toward dist>=2 targets.

This descendant inserts g7's stencil routing as a new tier sitting
between the parent's adjacent-kill scan and the Conqueror.act defer.
The new tier fires only when:

1. The kill scan found no beatable adjacent enemy at MARGIN=0.4
   (bestTile is null) -- so we never undo the guard's "defer rather
   than commit a Pyrrhic kill" decision.
2. hasNonStallMove is true -- there's at least one productive
   adjacent action to chain through.
3. The 5x5 stencil has a dist>=2 beatable target whose primary or
   secondary cardinal lane is currently passable.

When all three hold, we route via tryCommit on the primary lane,
then the secondary on failure, exactly as g7 does in its Pass 3.
Otherwise we defer to Conqueror.act exactly as the parent did. dist=1
stencil picks are skipped because the parent's kill scan at MARGIN=0.4
is strictly more permissive than tryCommit's +0.6 -- any adjacent it
rejected would also fail tryCommit.

Behaviour is byte-identical to the parent in three preserved states:
(a) when the kill scan picks an adjacent and the guard passes (kill
commits), (b) when the guard trips (defer to Conqueror, untouched),
and (c) in the true standoff where every neighbor is null/full-
friendly/unbeatable (no-margin kill stall-breaker untouched). The
change only adds *direction* to what would otherwise be an
arbitrary Conqueror.act local rebalance -- e.g. reinforcing the
friendly that lies on the route to a distant enemy instead of one
that doesn't.

Tech preserved at 90/0/2/4/4 -- the move-heavy GA optimum across
the whole Conqueror_g4+ lineage and explicitly load-bearing for the
parent's MARGIN=0.4 kill: the saved garrison strength is what makes
the +0.4 surplus exploitable on the next tick.`,
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

    // Single sweep across cardinals: gather per-tile enemy strength,
    // find the best-scored beatable kill at MARGIN=0.4, and decide
    // whether the position has any productive non-stall move.
    const enemyAt = [0, 0, 0, 0];
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
        hasNonStallMove = true;
        continue;
      }
      if (friendlyArmy) {
        if (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
          hasNonStallMove = true;
        }
        continue;
      }
      enemyAt[i] = enemy;
      const needed = enemy / BONUS + MARGIN;
      if (needed > sLimit) continue;
      hasNonStallMove = true;

      let friendlyReach = 0;
      const enbrs = t.neighbors;
      for (let n = 0; n < 4; n++) {
        const nt = enbrs[n];
        if (!nt) continue;
        const na = nt.armies;
        for (let k = 0; k < na.length; k++) {
          const a = na[k];
          if (a.player.id === pid) friendlyReach += a.strength;
        }
      }
      const score = enemy + REACH_WEIGHT * friendlyReach;
      if (score > bestScore) {
        bestScore = score;
        bestTile = t;
        bestNeeded = needed;
      }
    }

    if (bestTile) {
      // Defensive guard from g5_d70030: a counter-attack from a
      // non-target cardinal arrives at ~(maxOther - 1) * BONUS
      // effective strength. Skip the kill if our remainder can't
      // hold against that.
      const remaining = army.strength - bestNeeded;
      let maxOther = 0;
      for (let i = 0; i < 4; i++) {
        if (neighbors[i] === bestTile) continue;
        const e = enemyAt[i];
        if (e > maxOther) maxOther = e;
      }
      if ((maxOther - 1) * BONUS < remaining) {
        army.attack(bestTile, bestNeeded);
        return;
      }
      // Guard tripped -- fall through and defer to Conqueror, exactly
      // as the parent did. We do NOT run the stencil router here, since
      // it could pick the same guard-rejected adjacent at +0.6 and
      // commit the Pyrrhic kill the guard just refused.
    }

    if (hasNonStallMove) {
      // NEW (this descendant): when no adjacent kill was found, prefer
      // g7_0cfdd6's stencil routing toward a dist>=2 beatable target
      // over Conqueror.act's local rebalance. Only fires if the stencil
      // search produced an attack -- otherwise we defer exactly as the
      // parent did.
      if (!bestTile && tryStencilRoute(army, tile, neighbors, sLimit, pid)) return;
      Conqueror.act(army, game);
      return;
    }

    // True standoff: every neighbor is too-strong-enemy or
    // full-friendly. Spend the forward stack on the weakest
    // beatable-by-strict-threshold enemy.
    tryNoMarginKill(army, neighbors, sLimit, pid);
  },
};
