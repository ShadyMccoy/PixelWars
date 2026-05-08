import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent g3_be9a58 ran BUFFER=0.6 (inherited from the g6_1cded0
// retake-aware-kill ancestor). The sibling lineage g8 -> g9 -> g10
// -> g11 stepped this down 0.6 -> 0.5 -> 0.4 -> 0.3 across four
// generations, each one dominating its season with no recorded
// losses. g11_e13995 (BUFFER=0.3) is one of the two bots that
// beat the parent in season #86. The same precision argument that
// justified each previous step still holds at 0.3:
//   - float precision is ~1e-4, leaving ~3000x slack at BUFFER=0.3.
//   - kills that previously sat one tick short of feasibility now
//     fire this tick instead.
//   - committed kills leave 0.3 more residual strength behind for
//     Conqueror.act / next-tick play.
// Attack resolution still fires before growth in the same tick, so
// the enemy snapshot equals the strength we resolve against.
const BUFFER = 0.3;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.8;

const DIR_HINT = (() => {
  const out = new Array(25);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const dy = i - 2;
      const dx = j - 2;
      if (dx === 0 && dy === 0) { out[i * 5 + j] = -1; continue; }
      if (Math.abs(dx) >= Math.abs(dy)) out[i * 5 + j] = dx < 0 ? 0 : 1;
      else out[i * 5 + j] = dy < 0 ? 2 : 3;
    }
  }
  return out;
})();

// Conqueror_g4_a7924b — descendant of Conqueror_g3_be9a58.
//
// Single targeted change: BUFFER 0.6 -> 0.3, plus a paired bug fix
// in Pass 3's reachability filter so it matches the commit gate
// exactly (parent used `enemy/BONUS > sLimit + 0.5` as the filter,
// which let unkillable enemies through and could pick a tile the
// later commit rejected, returning empty-handed; the correct gate
// is `enemy/BONUS > sLimit - BUFFER`, mirroring tryCommit's
// `needed > sLimit` check on `enemy/BONUS + BUFFER`).
//
// The retake-aware Pass 1 (RETAKE_W, FRIENDLY_W, RETAKE_VETO) is
// kept verbatim — it's the differentiator that gave the parent its
// edge over plain Conqueror, and the buffer tightening is
// independent of and stacks with the retake score.
//
// Tech unchanged from the parent / shared lineage optimum.
export default {
  name: "Conqueror_g4_a7924b",
  author: "claude",
  version: 1,
  description: "Conqueror_g3_be9a58 with BUFFER tightened 0.6 -> 0.3 and Pass 3 filter aligned to commit gate.",
  summary: `Parent Conqueror_g3_be9a58 was beaten in season #86 by
Conqueror_g11_e13995 (which ran BUFFER=0.3) and by
Conqueror_g7_efa4e0 (a sibling on hemisphere-weighted Pass 1).
The cleanest, best-evidenced single change is to apply the same
proven buffer tightening that the g8->g11 sibling chain rode to
four straight dominant seasons: 0.6 -> 0.5 -> 0.4 -> 0.3, each
parent winning its season with no losses.

The precision argument that justified every previous step still
holds: float precision is ~1e-4, leaving ~3000x slack at 0.3.
Kills at the feasibility edge land one tick earlier; committed
kills leave 0.3 more strength in the garrison; attack resolution
fires before growth in the same tick, so no other invariant moves.

A second, paired fix: Pass 3's reachability filter in the parent
checked enemy/BONUS > sLimit + 0.5, which accepted unkillable
enemies (the +0.5 should have been -BUFFER). This caused the
stalemate pass to occasionally pick a "weakest" target the later
commit rejected, leaving the army stuck for a tick. Aligning the
filter to sLimit - BUFFER mirrors the actual commit gate and lets
Pass 3 always pick a feasible target when one exists.

The retake-aware Pass 1 (RETAKE_W=0.8, FRIENDLY_W=0.4,
RETAKE_VETO=1.8) and the rest of the chassis are unchanged.
Tech unchanged: the shared lineage optimum.`,
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

    // Pass 1: best beatable adjacent kill with retake-aware scoring.
    let bestKill = null;
    let bestScore = -Infinity;
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
      if (enemy <= 0) {
        if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
          hasOtherTarget = true;
        }
        continue;
      }
      const needed = enemy / BONUS + BUFFER;
      if (needed > sLimit) continue;

      let backup = 0;
      let friend = 0;
      const tn = t.neighbors;
      for (let j = 0; j < 4; j++) {
        const tt = tn[j];
        if (!tt || tt === tile) continue;
        const ttArmies = tt.armies;
        let tnE = 0;
        let tnF = 0;
        for (let k = 0; k < ttArmies.length; k++) {
          const a = ttArmies[k];
          if (a.player.id === pid) tnF += a.strength;
          else tnE += a.strength;
        }
        if (tnE > backup) backup = tnE;
        if (tnF > friend) friend = tnF;
      }

      if (backup >= RETAKE_VETO) continue;

      const score = enemy - RETAKE_W * backup + FRIENDLY_W * friend;
      if (score > bestScore) {
        bestScore = score;
        bestKill = t;
        bestNeeded = needed;
      }
    }
    if (bestKill) {
      army.attack(bestKill, bestNeeded);
      return;
    }

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }
    let hasAnyAdjacentEnemy = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      for (let k = 0; k < armies.length; k++) {
        if (armies[k].player.id !== pid) { hasAnyAdjacentEnemy = true; break; }
      }
      if (hasAnyAdjacentEnemy) break;
    }
    if (hasAnyAdjacentEnemy) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: stalled. 5x5 weakest-prey fallback. Reachability
    // filter aligned to commit gate: enemy/BONUS > sLimit - BUFFER
    // means tryCommit would reject it, so skip in the picker too.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const reachableEnemyOverBonus = sLimit - BUFFER;

    let bestDir = -1;
    let bestEnemy = Infinity;
    let bestDist = 0;
    for (let i = 0; i < 25; i++) {
      const dir = DIR_HINT[i];
      if (dir < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const enemy = -sumStrength(t.armies, viewer);
      if (enemy <= 0) continue;
      if (enemy / BONUS > reachableEnemyOverBonus) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      if (enemy < bestEnemy || (enemy === bestEnemy && dist < bestDist)) {
        bestEnemy = enemy;
        bestDist = dist;
        bestDir = dir;
      }
    }
    if (bestDir < 0) return;
    const target = neighbors[bestDir];
    if (!target) return;
    const tArmies = target.armies;
    let friendlyArmy = null;
    let enemy = 0;
    for (let k = 0; k < tArmies.length; k++) {
      const a = tArmies[k];
      if (a.player.id === pid) friendlyArmy = a;
      else enemy += a.strength;
    }
    if (enemy > 0) {
      const needed = enemy / BONUS + BUFFER;
      if (needed > sLimit) return;
      army.attack(target, needed);
      return;
    }
    if (friendlyArmy) {
      if (friendlyArmy.strength >= friendlyArmy.maxStrength - 0.5) return;
      const room = friendlyArmy.maxStrength - friendlyArmy.strength;
      const power = Math.min(sLimit, room);
      if (power > 0.5) army.attack(target, power);
      return;
    }
    army.attack(target, sLimit);
  },
};
