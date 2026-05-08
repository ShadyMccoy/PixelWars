import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Lineage: g8(0.6) -> g9(0.5, dominated #77) -> g10(0.4, dominated
// #87). Each step said "still leaves N orders of magnitude of
// float-precision slack, kills land one tick earlier at the edge,
// and 0.1 more strength stays in the garrison for Conqueror.act
// to spend next tick." The same argument holds at 0.3: ~3000x
// float-precision slack is still well above the ~1e-4 worst-case
// drift from a handful of summed enemy strengths, so the change
// remains dominantly upside.
const BUFFER = 0.3;

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

// Parent g10_e067cc dominated season #87 (no recent losses
// recorded). Its rationale was that g9's BUFFER=0.5 -> g10's 0.4
// step kept ~4000x float-precision slack while shaving one tick
// off edge kills and leaving 0.1 more strength in the garrison.
// The same two effects compound at 0.3 with ~3000x slack still
// in hand, which is orders of magnitude above any realistic
// summed-float drift on lab1 (handfuls of enemy armies, each at
// most maxArmy=12).
//
// Attack resolution still fires before growth in the same tick,
// so the snapshot we read equals what we resolve against; the
// only remaining uncertainty is float precision (~1e-4),
// unchanged. All other structure preserved from the parent:
//   - Pass 1: strongest beatable adjacent enemy.
//   - Pass 2: delegate to Conqueror.act for non-kill adjacent work.
//   - Pass 3: 5x5 stalemate kernel with distance / 4-level
//     path-clear / weakness keys. Reachability gate slides to
//     sLimit - 0.3 in lockstep with tryCommit's commit margin.
//   - Tech unchanged at {move:90, stack:0, prod:2, atk:4, def:4}.
export default {
  name: "Conqueror_g11_03759c",
  author: "claude",
  version: 1,
  description: "Conqueror_g10 with kill buffer tightened from 0.4 to 0.3 (one notch past the parent's own buffer reduction).",
  summary: `Lineage continuation. g8 used BUFFER=0.6, g9 cut it to
0.5 and dominated season #77, g10 cut it to 0.4 and dominated
season #87. At each step the rationale was the same: the BUFFER
exists to absorb summed-float drift on the enemy strength
snapshot, so as long as it stays orders of magnitude above the
~1e-4 realistic drift, tightening it is dominantly upside —
edge kills land one tick earlier and 0.1 more strength stays in
the garrison per committed kill.

Single targeted change: BUFFER 0.4 -> 0.3 in both Pass 1 and
tryCommit. Pass 3's reachability gate slides to sLimit - 0.3 in
lockstep so the kernel's "is this enemy reachable next move"
prediction continues to match tryCommit's actual commit margin.

At 0.3 we still have ~3000x float-precision slack — well beyond
what handfuls of enemy strengths summed to ~12 each can produce.
Attack resolution still fires before growth, so the snapshot
read equals what we resolve against.

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
    // threshold matches tryCommit's commit margin exactly (now 0.3).
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
