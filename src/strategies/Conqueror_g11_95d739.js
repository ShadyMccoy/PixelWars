import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent g10_e067cc tightened BUFFER from 0.5 to 0.4 and lost
// season #81 to g6_9eb2e4 (which still runs the proven 0.5).
// The chain g6 (0.5, won s#40) -> g9 (0.5, won s#77) -> g10
// (0.4, lost s#81) reads as a sign that 0.4 went one notch too
// far. Revert to 0.5: still ~5000x float-precision slack, and we
// stop being the most aggressive BUFFER in the field.
const BUFFER = 0.5;

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

// Two changes vs parent g10_e067cc, both pulling on the same
// "throughput beats raw hitting power" thread the lineage has
// been riding since g4_b6afb7 reverted from atk:14 to atk:4.
//
// 1) BUFFER 0.4 -> 0.5. Parent g10 lost season #81 to g6_9eb2e4
//    (BUFFER=0.5). The proven winners on this lineage all sit at
//    0.5 (g6 won s#40, g9 won s#77); 0.4 is the only BUFFER value
//    that has a recorded loss. Revert.
//
// 2) Pass 1 priority: strongest-feasible -> WEAKEST-feasible kill.
//    This is the bigger change. The parent's whole BUFFER thesis
//    was that committing 0.1 less strength per kill compounds into
//    more empty-grab / friendly-balance via Conqueror.act on later
//    ticks. Strongest-first deliberately commits the *most* strength
//    among feasible kills (needed = enemy/1.4 + BUFFER), wasting
//    that throughput. Weakest-first commits the least, leaving
//    sLimit - (weak_enemy/1.4 + 0.5) in the garrison vs
//    sLimit - (strong_enemy/1.4 + 0.5) on the same tick. Across a
//    30x22 wrap map at maxArmy=12 the gap per kill is often 3-5
//    units of strength, which is dramatically more than the 0.1
//    gain BUFFER tightening was reaching for.
//
//    Counter-argument is "strongest-first neutralizes the biggest
//    threat first." But the strongest adjacent enemy is bounded by
//    maxArmy=12 and we already proved (via the feasibility check)
//    that we *can* kill it whenever we choose. Killing the cheap
//    one first then coming back for the strong one next tick costs
//    one tick of exposure to the big threat in exchange for a fat
//    garrison residue that funds an extra empty-grab or
//    friendly-balance this tick (via Conqueror.act through the
//    Pass 2 fallthrough... wait, Pass 1 returns after the kill).
//    Pass 1 still returns after committing, so the residue carries
//    to *next* tick's larger sLimit, identical compounding to the
//    parent's BUFFER argument.
//
// Pass 3's reachability gate slides back to sLimit - 0.5 in
// lockstep with BUFFER. Tech, sizing, DIR_HINTS, the path-clear
// cache and Pass 3's distance/clear/weakness tiebreak chain are
// preserved unchanged from g10.
export default {
  name: "Conqueror_g11_95d739",
  author: "claude",
  version: 1,
  description: "Conqueror_g10 with BUFFER reverted to 0.5 and Pass 1 kill priority flipped to weakest-feasible-first for throughput.",
  summary: `Parent Conqueror_g10_e067cc finished #5 of 6 in season #81,
losing to Conqueror_g6_9eb2e4 which runs the proven BUFFER=0.5. The
lineage's BUFFER history is g6 (0.5, won s#40), g9 (0.5, won s#77),
g10 (0.4, lost s#81) — 0.4 is the only value with a recorded loss,
so revert to 0.5. Five thousand times float-precision slack is still
ample.

The bigger change is Pass 1 kill priority. Parent's strongest-first
selects the kill that commits the *most* strength among feasible
options (needed = enemy/1.4 + BUFFER scales with enemy strength).
That directly contradicts the throughput thesis the BUFFER reduction
was reaching for: every 0.1 saved on the buffer was supposed to
compound into more empty-grab and friendly-balance later. Weakest-
feasible-first saves units of strength per kill, not tenths.

The trade is one tick of exposure to the strongest adjacent enemy
in exchange for a fat garrison residue that carries into next
tick's larger sLimit. The strongest enemy is capped at maxArmy=12
and we already proved we can kill it whenever we choose (it passed
the feasibility gate this tick), so deferring it one tick rarely
loses the option.

Tech unchanged at the GA-optimum {move:90, stack:0, prod:2, atk:4,
def:4}. Pass 3's full stalemate kernel (5x5 with distance / 4-level
path-clear / weakness tiebreak) and the reachability gate
(sLimit - 0.5, in lockstep with BUFFER) are preserved.`,
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

    // Pass 1: WEAKEST beatable adjacent enemy (throughput pivot).
    let bestKill = null;
    let bestEnemy = Infinity;
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
        if (enemy < bestEnemy) {
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
    // threshold matches tryCommit's commit margin (sLimit - 0.5).
    const stencil = tile.stencil5;
    if (!stencil) return;
    const viewer = army.player;
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
