import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Inherited from parent Conqueror_g5_897d51: kill margin 0.45 (vs the
// classic 0.6) catches every fight in [enemy/1.4 + 0.45, enemy/1.4 +
// 0.6) as a real kill. That margin tightening was the single change
// that let Conqueror_g5_b451ab beat the g4 lineage in season #92.
const MARGIN = 0.45;

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
    const needed = enemy / BONUS + MARGIN;
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

// Last-resort kill: when every other pass refused to commit (all
// neighbors too strong for the 0.45 margin AND no distance-2
// beatable target via Pass 3), attempt a full-sLimit attack on the
// weakest-but-still-too-strong neighbor whose strict engine kill
// threshold (sLimit * BONUS * atkMult > enemy * defMult) we DO meet.
//
// The window between tryCommit's threshold (needed = enemy/1.4 +
// 0.45) and the strict kill threshold (sLimit * BONUS > enemy)
// contains the weakest "too strong" neighbors. A full-sLimit attack
// on one of those still flips the tile; the survivor is thin but the
// raw trade is favorable, and the home garrison is untouched. Mixed
// neighbors are skipped to avoid friendly-fire reasoning.
function tryNoMarginKill(army, neighbors, sLimit, pid) {
  if (sLimit <= 0.5) return false;
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
      if (a.player.id === pid) { mixed = true; continue; }
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
  if (best) {
    army.attack(best, sLimit);
    return true;
  }
  return false;
}

export default {
  name: "Conqueror_g6_b70bfa",
  author: "claude",
  version: 1,
  description: "Conqueror_g5_897d51 plus a no-margin kill safety net for stalled positions.",
  summary: `Parent Conqueror_g5_897d51 finished #4 of 6 in season #96,
losing to Conqueror_g7_3f7da6 among others. g7_3f7da6's whole edge
over its own lineage was a no-margin kill fallback that fires when
every neighbor is "too strong" by tryCommit's comfort margin but
still beatable by the strict engine threshold (sLimit * BONUS *
atkMult > enemy * defMult). The parent's structure has the same
idle-in-stall failure mode: when Pass 1's 0.45-margin scan finds no
killable neighbor, Pass 2 punts to Conqueror.act, and Pass 3's
distance-2 routing fails because the neighbors on the path are also
too strong for tryCommit, the bot just sits.

This descendant keeps everything that worked in the parent:
  - The 3-pass chassis (Pass 1 kill -> Pass 2 Conqueror.act ->
    Pass 3 stencil routing).
  - MARGIN = 0.45 in tryCommit and Pass 1, so the
    [enemy/1.4 + 0.45, enemy/1.4 + 0.6) band still resolves as
    real kills instead of stalls.
  - Tech unchanged (move:90 blitz).

The only addition is tryNoMarginKill as a Pass 4 safety net, called
after Pass 3 produces no commit. The window between tryCommit's
threshold (needed = enemy/1.4 + 0.45) and the strict kill threshold
(sLimit * BONUS > enemy) is narrower than g7_3f7da6's 0.6-window
(because we already absorbed 0.15 of it into Pass 1), but it is
still non-empty: a neighbor with enemy = sLimit * BONUS - epsilon
falls outside Pass 1's needed <= sLimit check yet a full-sLimit
attack does kill it. Those are exactly the standoffs the parent
loses.

Mixed-owner tiles are skipped (keeps the reasoning local). The
strongest defender's defMult bounds the kill ceiling so multi-enemy
tiles aren't misjudged. Pass 4 only triggers in true stalemate, so
the parent's behavior in the common case is preserved exactly -
this is a strict superset of moves the parent would make.`,
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

    // Pass 1: strongest beatable adjacent enemy, tightened margin.
    let bestKill = null;
    let bestEnemy = -1;
    let bestNeeded = 0;
    let hasOtherTarget = false;
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
        const needed = enemy / BONUS + MARGIN;
        if (needed > sLimit) continue;
        if (enemy > bestEnemy) {
          bestEnemy = enemy;
          bestNeeded = needed;
          bestKill = t;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }
    if (bestKill) {
      army.attack(bestKill, bestNeeded);
      return;
    }

    // Pass 2: any other adjacent action viable -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. Stencil5 routing toward closest
    // beatable enemy (tiebreak weakest).
    if (tile.stencil5) {
      const stencil = tile.stencil5;
      const viewer = army.player;
      const reachableEnemyOverBonus = sLimit - MARGIN;

      let bestPrim = -1;
      let bestSec = -1;
      let bestDist = Infinity;
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
        if (dist < bestDist || (dist === bestDist && enemy < bestWeak)) {
          bestDist = dist;
          bestWeak = enemy;
          bestPrim = hints[0];
          bestSec = hints[1];
        }
      }
      if (bestPrim >= 0) {
        const primaryTarget = neighbors[bestPrim];
        if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
        if (bestSec >= 0) {
          const secondaryTarget = neighbors[bestSec];
          if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
        }
      }
    }

    // Pass 4: last-resort no-margin kill on a slightly-too-strong
    // neighbor. Only fires when Pass 3 found nothing (no beatable
    // distance-2 target) or its routing went through neighbors
    // tryCommit refused. Erases stronger enemy at favorable raw trade.
    tryNoMarginKill(army, neighbors, sLimit, pid);
  },
};
