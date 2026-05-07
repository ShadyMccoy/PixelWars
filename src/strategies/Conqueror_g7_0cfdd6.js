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

// Parent Conqueror_g6_aa7266 inserted a path-clear tiebreak in its
// Pass 3 stencil fallback that scored each candidate on whether its
// PRIMARY cardinal neighbor was passable. That helped — but it only
// captures half the routing logic. tryCommit actually has TWO chances
// per stencil pick: it tries the primary direction first, and on
// failure falls through to the secondary axis. So a stencil target
// whose primary is blocked but secondary is open is still a viable
// commit, while a target where both are blocked is a dead pick.
//
// The parent collapsed both of those into clear=0, treating "viable
// via secondary only" the same as "fully unreachable this tick". When
// two equidistant beatable stencil enemies tie, the parent could
// pick the unreachable one over a sibling that the secondary axis
// would have routed cleanly.
//
// This descendant extends the path-clear score to a 4-level metric:
//   clear = primary_passable * 2 + secondary_passable
// so 3 = both lanes open (best), 2 = primary only (parent's "1"),
// 1 = secondary only (newly distinguished from blocked), 0 = both
// blocked. Distance is still the dominant key, weakness is still the
// final tiebreak. The only change is that among equidistant stencil
// targets we now prefer ones where ANY routing lane is currently
// open, biased toward the primary axis. That converts more stencil
// "intent" into actual one-tick motion when the primary lane happens
// to be jammed.
//
// Tech is unchanged: {move:90, stack:0, prod:2, atk:4, def:4} is the
// shared optimum across the winning Conqueror cousin lineage and the
// parent's runaway season #35 result (no recorded losses) confirms
// it.
export default {
  name: "Conqueror_g7_0cfdd6",
  author: "claude",
  version: 1,
  description: "Conqueror_g6 with two-axis path-clear scoring in the 5x5 stalemate fallback.",
  summary: `Parent Conqueror_g6_aa7266 went undefeated in season #35
on the proven {move:90, stack:0, prod:2, atk:4, def:4} tech and a
3-pass kernel (strongest-first adjacent kill -> Conqueror.act ->
distance/clear/weakness 5x5 fallback). The parent's tiebreak in
Pass 3 was a step forward — preferring stencil targets whose primary
cardinal neighbor was currently passable — but it ignored the
secondary-axis fallback that tryCommit actually performs.

tryCommit on a stencil pick first attempts the primary direction;
if that's blocked it tries the secondary. So three of four stencil
candidates can produce a real attack: both-axes-open, primary-only,
or secondary-only. Only "both-axes-blocked" stalls. The parent's
clear score (0/1) collapses secondary-only into the same bucket as
both-blocked, occasionally letting the kernel pick a fully
unreachable equidistant target over a sibling reachable via the
secondary lane.

This descendant uses a 4-level path-clear score:
  clear = primary_passable * 2 + secondary_passable
ranging 0..3, with the same distance-first / weakness-last sort
order. The score still prefers primary-open over secondary-only
(matching what tryCommit prefers), but now distinguishes
secondary-only from fully blocked. Same kill priority, same
adjacent-mode handling, same tech anchor.`,
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
        const needed = enemy / BONUS + 0.6;
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

    // Pass 3: full stalemate. 5x5 with distance-first, two-axis
    // path-clear tiebreak, weakness as final tiebreak.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    // Cache neighbor passability for the four cardinal directions:
    //   1  = passable (empty, friendly with room, or beatable enemy)
    //   0  = blocked (no neighbor, strong enemy, or full friendly)
    // Computed lazily; both the primary and the secondary axis are
    // queried so we can score stencil routing on what tryCommit will
    // actually do.
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
