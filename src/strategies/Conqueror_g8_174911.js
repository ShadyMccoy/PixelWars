import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const REACH_WEIGHT = 0.5;
// Lowered from the parent's implicit 0.6 (inherited via Conqueror.act
// hasAdjacentTarget threshold). 0.4 is the value that sibling
// Conqueror_g6_15ea9a used to beat the parent in season #71 game 1.
const MARGIN = 0.4;

// No-margin kill, preserved verbatim from parent g7. Final safety net
// when every neighbor is either a too-strong enemy or a full friendly:
// spend full sLimit on the weakest "too strong" pure-enemy neighbor.
// The strict kill threshold is sLimit * BONUS * atkMult > enemy * defMult,
// so this commits an attack that does kill (survivor thin or 0). Mixed-
// owner tiles are skipped to keep reasoning local; the strongest
// defender's defMult bounds the kill ceiling for multi-enemy tiles.
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

// Parent Conqueror_g7_3f7da6 lost both season-#71 games it played to
// independent improvements on the same adjacent-enemy decision:
//
//   * Conqueror_g6_15ea9a — MARGIN 0.6 -> 0.4 with reach-weighted
//     scoring. Opens kills in the near-parity band
//     enemy/1.4 + 0.4 <= sLimit < enemy/1.4 + 0.6 that g7 refused.
//   * Conqueror_g5_d70030 — defensive guard before commit. Estimates
//     the strongest counter-attack from non-target cardinals as
//     (maxOther - 1) * BONUS; aborts the kill if our remainder can't
//     survive it.
//
// Both levers act on the same code path (the adjacent-kill choice)
// but solve different failure modes, so they compose. This descendant
// applies both before deferring to Conqueror, and keeps g7's own
// no-margin kill as a stall-breaker when truly idle.
//
// Tech 90/0/2/4/4 preserved -- the move-heavy GA optimum across the
// entire Conqueror_g4+ lineage; the saved 0.2 strength per kill
// (MARGIN 0.6 -> 0.4) is exploitable precisely because the low
// garrison floor leaves more reserve for the next tick.
export default {
  name: "Conqueror_g8_174911",
  author: "claude",
  version: 1,
  description: "Conqueror_g7 with MARGIN=0.4 reach-weighted kill scan (from g6_15ea9a) and a counter-attack defensive guard (from g5_d70030); g7's no-margin stall-breaker preserved.",
  summary: `Parent Conqueror_g7_3f7da6 lost season #71 to two distinct
descendants of earlier lineages: Conqueror_g6_15ea9a (MARGIN 0.6 ->
0.4 with reach-weighted scoring) and Conqueror_g5_d70030 (defensive
guard against multi-front counter-attack). Both empirically beat the
parent. They are orthogonal levers on the same adjacent-kill
decision, so this descendant stacks them, then preserves g7's own
contribution as a final stall-breaker.

Composition:

1. Reach-weighted kill scan at MARGIN=0.4. Picks the highest-scoring
   beatable adjacent enemy (enemy strength + 0.5 * adjacent friendly
   mass). Captures the near-parity seam kills g7 refused. Post-kill
   surplus is still 0.4 * 1.4 = 0.56 -- positive ownership with a
   small garrison.

2. Defensive guard before commit. Strongest counter from a
   non-target cardinal arrives at ~(maxOther - 1) * BONUS effective
   strength. If our post-attack remainder can't survive it, defer to
   Conqueror's alignment kernel rather than commit a Pyrrhic kill.
   In clean 1v1-adjacency situations the guard never trips and the
   scan reduces to g6_15ea9a's behaviour exactly.

3. Defer to Conqueror.act for any non-stall state Conqueror handles
   natively -- empty grabs, friendly rebalances, or its own kill
   attempt with the broader margin (which may pick a different cell
   than our scan).

4. No-margin kill stall-breaker (from g7). When every neighbor is
   either a too-strong enemy or a full-friendly -- a true standoff --
   spend full sLimit on the weakest "too strong" pure-enemy
   neighbor. Trade: erase ~sLimit of enemy strength while the home
   garrison stays intact. Mutual destruction at the upper edge is
   still a net favorable raw trade.

Tech 90/0/2/4/4 preserved (move-heavy GA optimum across the lineage).
Mixed-owner tiles skipped throughout to keep reasoning local.`,
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
        // Mixed tile -- uncommon, defer to Conqueror.
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
      // Guard tripped -- fall through. hasNonStallMove is already
      // true (we found a kill candidate), so we'll defer to
      // Conqueror, which may pick a different cell or hold.
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
