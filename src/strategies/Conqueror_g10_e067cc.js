import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent g9_52a3a8 dropped BUFFER from 0.6 to 0.5 and dominated
// season #77 (no losses recorded). The parent's own rationale
// ("0.5 still leaves ~5000x float-precision slack") applies even
// more weakly to a tighter value. Push one notch further to 0.4:
// still ~4000x float-precision slack, but every kill at the
// feasibility edge lands one tick earlier and committed kills
// leave 0.1 more strength in the garrison for Conqueror.act to
// spend on empty-grab / friendly-balance next tick.
const BUFFER = 0.4;

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
    const needed = enemy / BONUS + BUFFER;
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

// Parent Conqueror_g9_52a3a8 dominated season #77 with no losses
// recorded. Its own design note: g9 came from g8 by dropping the
// kill safety BUFFER from 0.6 to 0.5, matching the simpler g6
// variant that beat the prior parent. The argument was that 0.5
// still leaves ~5000x float-precision slack, so the tighter
// margin is dominantly upside (kills land one tick earlier,
// 0.1 more strength stays in the garrison per committed kill).
//
// The same argument extends to 0.4: ~4000x float-precision slack
// is still ample, and the same two effects (earlier-landing kills,
// more residual garrison) compound. Attack resolution fires before
// growth in the same tick, so the enemy snapshot we read still
// equals the strength we resolve against — the only remaining
// uncertainty is float precision (~1e-4), unchanged.
//
// All other structure preserved from the parent:
//   - Pass 1: raw enemy strength for adjacent kill selection.
//   - Pass 2: delegate to Conqueror.act for non-kill adjacent work.
//   - Pass 3: 5x5 stalemate kernel with distance / 4-level
//     path-clear / weakness keys, reachability gate matching
//     tryCommit's commit margin (now sLimit - 0.4).
//   - Tech unchanged at {move:90, stack:0, prod:2, atk:4, def:4}.
export default {
  name: "Conqueror_g10_e067cc",
  author: "claude",
  version: 1,
  description: "Conqueror_g9 with kill buffer tightened from 0.5 to 0.4 (one notch past the parent's own buffer reduction).",
  summary: `Parent Conqueror_g9_52a3a8 dominated season #77 with
no losses recorded. The parent's own thesis was that dropping
BUFFER from 0.6 to 0.5 was dominantly upside because 0.5 still
leaves three orders of magnitude of float-precision slack and
every kill at the feasibility edge lands one tick earlier with
0.1 more strength left in the garrison.

That argument extends naturally to 0.4: ~4000x float-precision
slack remains, and the same two effects (earlier-landing kills,
more residual garrison) compound. Attack resolution still fires
before growth in the same tick, so the enemy snapshot equals the
strength we resolve against; nothing about the precision story
changes.

Single targeted change: BUFFER 0.5 -> 0.4 in both Pass 1 and
tryCommit. Pass 3's reachability gate slides to sLimit - 0.4 in
lockstep so it continues to match tryCommit's commit margin
exactly.

Tech, sizing, the path-clear cache, DIR_HINTS, and the 3-pass
chassis (Conqueror.act for empty/balance, full stalemate
fallback) are unchanged from the parent.`,
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

    // Pass 1: strongest beatable adjacent enemy.
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
        const needed = enemy / BONUS + BUFFER;
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

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 with distance-first, 4-level
    // path-clear tiebreak, weakness as final tiebreak. Reachability
    // threshold matches tryCommit's commit margin exactly (now 0.4).
    const stencil = tile.stencil5;
    if (!stencil) return;
    const viewer = army.player;
    // tryCommit needs `enemy/BONUS + BUFFER <= sLimit`, i.e.
    // enemy/BONUS <= sLimit - BUFFER to actually fire.
    const reachableEnemyOverBonus = sLimit - BUFFER;

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
