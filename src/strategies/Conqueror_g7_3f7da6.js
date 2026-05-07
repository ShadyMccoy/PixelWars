import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

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

// Last-resort kill on a slightly-too-strong neighbor enemy. tryCommit
// refuses any enemy where `enemy/BONUS + 0.6 > sLimit` -- the +0.6 raw
// is a comfort margin (~0.84 effective). The strict kill condition is
// just `attacker_eff > defender_eff`, i.e. `sLimit * BONUS * atkMult >
// enemy * defMult`. The window between tryCommit's threshold and the
// strict-kill threshold contains the WEAKEST "too strong" neighbors:
// a full-sLimit attack does kill them, the survivor is just thin.
//
// We attempt this only after the regular fallback has failed (i.e. we
// are stalled and the broken stencil routing produced nothing). Mixed
// neighbors are skipped to avoid friendly-fire reasoning. Multi-enemy
// tiles use the strongest defender's defMult as the conservative
// bound (the actual fight is per-army but assuming max def is safe).
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
    // Strict kill threshold; small epsilon so floating-point ties
    // don't slip through as a failed cancellation.
    const killCeiling = (sLimit * effBonus) / maxDef - 0.05;
    if (enemy >= killCeiling) continue;
    if (enemy < bestEnemy) {
      bestEnemy = enemy;
      best = t;
    }
  }
  if (best) army.attack(best, sLimit);
}

// Parent Conqueror_g6_7865bd dominated season #57 undefeated. Its
// stalled-state fallback -- the 5x5 stencil routing toward a beatable
// distance-2 enemy -- is structurally a no-op: the fallback only fires
// when every adjacent tile is a too-strong enemy or a full friendly,
// and the routing through primary/secondary neighbors goes through
// one of those same tiles. tryCommit refuses both kinds, so the
// fallback never commits. The bot effectively idles in a stall.
//
// Idling preserves strength, but it leaves real kills on the table.
// tryCommit's safe-kill condition `needed = enemy/BONUS + 0.6 <=
// sLimit` carries a +0.6 raw margin (~0.84 effective). The actual
// kill condition from the engine resolution is `sLimit * BONUS *
// atkMult > enemy * defMult`. Between these two thresholds is a
// window of ~0.6 raw width containing the WEAKEST "too strong"
// neighbors. A full-sLimit attack on one of those does kill the
// enemy and capture the tile -- the survivor is thin but the tile
// flips, and we trade `sLimit` of our forward strength for the
// enemy's `enemy_strength` (a favorable raw trade since we picked
// the weakest candidate). Even if the survivor dies (mutual
// destruction at the upper edge), we still erase a stronger enemy
// at the cost of our forward stack while the home garrison stays
// intact -- a net favorable trade in raw strength terms.
//
// Everything above the fallback (Conqueror.act delegation, the
// hasAdjacentTarget short-circuit, the 5x5 selection itself) is
// unchanged. The no-margin kill is invoked as a final safety net
// after the existing routing exhausts. Tech is unchanged.
export default {
  name: "Conqueror_g7_3f7da6",
  author: "claude",
  version: 1,
  description: "Conqueror_g6 with a no-margin kill fallback for stalled standoffs.",
  summary: `Parent Conqueror_g6_7865bd ran season #57 undefeated. The
parent's 5x5 fallback routing is structurally a no-op when it
fires: the fallback only triggers when every adjacent tile is a
too-strong enemy or a full friendly, and the path to a distance-2
enemy goes through exactly those same neighbors -- tryCommit
refuses both. Fallback never commits, the bot idles.

This descendant adds a no-margin kill as a final safety net.
tryCommit's +0.6 raw margin (~0.84 effective) is a comfort buffer:
the strict kill threshold from the engine resolution is just
sLimit * BONUS * atkMult > enemy * defMult. The window between
those is ~0.6 raw wide and contains the WEAKEST "too strong"
neighbors. A full-sLimit attack on one of those kills the enemy
and captures the tile -- the survivor is thin, but the trade is
favorable: we spend sLimit forward power to erase ~the same amount
of enemy strength while the home garrison stays intact. Mutual
destruction at the upper edge is still a net favorable raw trade.

Mixed-owner tiles are skipped to keep the reasoning local. The
strongest defender's defMult bounds the kill ceiling so multi-enemy
tiles aren't misjudged. Conqueror.act delegation, hasAdjacentTarget
short-circuit, the 5x5 stencil routing, and BONUS are all
unchanged. Tech is unchanged.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
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

    // Stalled. Run the parent's 5x5 routing first (preserved verbatim
    // in case it ever does fire successfully on an edge case I missed),
    // then fall back to the no-margin kill if it doesn't commit.
    if (!tile.stencil5 || sLimit <= 0.5) {
      tryNoMarginKill(army, neighbors, sLimit, pid);
      return;
    }
    const stencil = tile.stencil5;
    const maxEnemy = (sLimit - 0.6) * BONUS;
    if (maxEnemy <= 0) {
      tryNoMarginKill(army, neighbors, sLimit, pid);
      return;
    }

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestEnemy = Infinity;
    for (let i = 0; i < 25; i++) {
      const hints = DIR_HINTS[i];
      if (hints[0] < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const tArmies = t.armies;
      let enemy = 0;
      for (let k = 0; k < tArmies.length; k++) {
        const a = tArmies[k];
        if (a.player.id !== pid) enemy += a.strength;
      }
      if (enemy <= 0) continue;
      if (enemy > maxEnemy) continue;
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

    if (bestPrim >= 0) {
      const primaryTarget = neighbors[bestPrim];
      if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
      if (bestSec >= 0) {
        const secondaryTarget = neighbors[bestSec];
        if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
      }
    }

    tryNoMarginKill(army, neighbors, sLimit, pid);
  },
};
