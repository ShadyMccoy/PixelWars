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

// Parent Conqueror_g8_74e11b lost three matches in season #78. Two of
// the winners differed on tech (Conqueror_g2_e90f66 at 80/0/0/4/16,
// Conqueror_g6_20faee at 75/0/2/13/10) — both abandoning the parent's
// 90/0/2/4/4 "GA optimum" in favor of balanced atk/def. The third
// winner (Conqueror_g5_d70030) kept the parent-lineage tech but added
// a defensive guard to Pass 1: after picking the strongest-beatable
// adjacent enemy, peek at the worst enemy on the OTHER cardinals and
// abort the kill if a counter would overrun the remainder.
//
// This descendant merges both winning insights:
//
//   1) Tech rebalance to 75/0/2/13/10 (g6_20faee's allocation, the
//      one that already beat this parent in seed=208). atk 4→13
//      shifts the multiplier from 0.952 to 1.039 (+9% damage); def
//      4→10 shifts 0.952 to 1.024 (+8% durability). move 90→75
//      raises the garrison floor from 0.60 to 0.75 — still well
//      below the 1.4 neutral, so the forward-throw character is
//      preserved at marginal cost (~0.15 strength/commit).
//
//   2) Defensive guard added to Pass 1 (g5_d70030's contribution).
//      After choosing bestKill/bestNeeded with the parent's
//      strongest-beatable selection, scan the OTHER three cardinals
//      for the worst enemy stack and estimate its counter-attack as
//      (maxOther - 1) * BONUS effective strength. If our post-attack
//      remainder can't survive that, defer to Conqueror.act rather
//      than commit to a Pyrrhic kill. In clean 1v1-adjacency cases
//      (where the parent already wins) the guard never trips and
//      behaviour is byte-identical to the parent's Pass 1.
//
// Pass 2 (Conqueror.act) and Pass 3 (5x5 stencil with distance-first,
// 4-level path-clear, weakness tiebreak) are byte-identical to the
// parent. The guard's "abort" path falls naturally into Pass 2, which
// the parent already runs whenever Pass 1 yields nothing.
export default {
  name: "Conqueror_g9_1e065b",
  author: "claude",
  version: 1,
  description: "Conqueror_g8 with g6_20faee's balanced tech (75/0/2/13/10) and g5_d70030's defensive guard on Pass 1.",
  summary: `Parent Conqueror_g8_74e11b lost three season #78 matches.
Two of three winners (Conqueror_g2_e90f66 at 80/0/0/4/16 and
Conqueror_g6_20faee at 75/0/2/13/10) differed on tech, abandoning the
parent lineage's 90/0/2/4/4 "GA optimum" in favor of balanced atk/def.
The third winner (Conqueror_g5_d70030) kept the tech but added a
defensive guard to Pass 1 against Pyrrhic kills: when the chosen
target leaves a remainder that can't survive a counter-attack from
another cardinal, defer to Conqueror.act instead of committing.

This descendant merges both:

  - Tech: adopt g6_20faee's 75/0/2/13/10 (validated against this
    exact parent in seed=208). atk 4→13 raises the attack multiplier
    from 0.952 to 1.039 (+9% damage); def 4→10 raises the defense
    multiplier from 0.952 to 1.024 (+8% durability). move 90→75
    raises the garrison floor from 0.60 to 0.75, still well under
    the 1.4 neutral so the parent's forward-throw character is
    preserved at marginal cost.

  - Pass 1 guard: after picking strongest-beatable, scan the other
    three cardinals for the worst enemy stack and estimate its
    counter as (maxOther - 1) * BONUS. If our post-attack remainder
    can't survive that, defer to Conqueror.act. In clean
    1v1-adjacency situations the guard never triggers and Pass 1 is
    byte-identical to the parent.

Pass 2 (Conqueror.act fallback) and Pass 3 (5x5 stencil with
distance-first, 4-level path-clear, weakness tiebreak; reachability
gate sLimit-0.6 matching tryCommit) are byte-identical to the
parent. The guard's "abort" path falls naturally into Pass 2.`,
  tech: { move: 75, stack: 0, prod: 2, atk: 13, def: 10 },
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

    // Pass 1: strongest beatable adjacent enemy, with retake guard.
    let bestKill = null;
    let bestEnemy = -1;
    let bestNeeded = 0;
    let bestKillIdx = -1;
    let hasOtherTarget = false;
    const enemyAt = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasOtherTarget = true; continue; }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (enemy > 0) {
        enemyAt[i] = enemy;
        const needed = enemy / BONUS + 0.6;
        if (needed > sLimit) continue;
        if (enemy > bestEnemy) {
          bestEnemy = enemy;
          bestNeeded = needed;
          bestKill = t;
          bestKillIdx = i;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }
    if (bestKill) {
      // Defensive guard: a counter-attack from another cardinal lands
      // at roughly (enemy - 1) * BONUS effective strength (typical
      // garrison ~1, attackerBonus 1.4). If our remainder can't
      // survive, defer rather than take a Pyrrhic kill.
      const remaining = army.strength - bestNeeded;
      let maxOther = 0;
      for (let i = 0; i < 4; i++) {
        if (i === bestKillIdx) continue;
        const e = enemyAt[i];
        if (e > maxOther) maxOther = e;
      }
      if ((maxOther - 1) * BONUS >= remaining) {
        Conqueror.act(army, game);
        return;
      }
      army.attack(bestKill, bestNeeded);
      return;
    }

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 with distance-first, 4-level
    // path-clear tiebreak, weakness as final tiebreak. Reachability
    // threshold matches tryCommit's commit margin exactly.
    const stencil = tile.stencil5;
    if (!stencil) return;
    const viewer = army.player;
    const reachableEnemyOverBonus = sLimit - 0.6;

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
        v = (enemy / BONUS <= reachableEnemyOverBonus) ? 1 : 0;
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
      if (enemy / BONUS > reachableEnemyOverBonus) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
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
    if (bestPrim < 0) return;

    const primaryTarget = neighbors[bestPrim];
    if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
    if (bestSec < 0) return;
    const secondaryTarget = neighbors[bestSec];
    if (secondaryTarget) tryCommit(army, secondaryTarget, sLimit, pid);
  },
};
