import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent g9_1e065b uses 0.6 throughout (Pass 1, tryCommit, Pass 3
// reachability). The bot that just beat the parent in season #106 -
// Conqueror_g6_f47ef4 - runs the same enemy/BONUS + margin formula
// with BUFFER=0.45, citing two independent winners (g5_b451ab,
// g4_de5d02) that beat their own parent with the same constant.
// The band [enemy/1.4 + 0.45, enemy/1.4 + 0.6) is full of
// attackPower values where g9 stalls but the tighter version
// actually kills, and every kill leaves 0.15 more strength behind
// on the home tile - exactly the "do not waste strength" identity
// Conqueror is built around. On lab1 (30x22 wrap, growth 1.8,
// maxArmy 12, ~6000 ticks) that compounds across hundreds of kills.
// Two independent winners replicating the same constant and a third
// (f47ef4) carrying it forward to beat g9 is a low-variance signal.
//
// Hypothesis: graft BUFFER=0.45 onto g9 (keeping g9's strongest-
// beatable selection, retake guard, tech 75/0/2/13/10, and 5x5
// stencil with 4-level path-clear and weakness tiebreak). Float
// jitter and small mid-tick reinforcements stay absorbed at 0.45;
// only a coordinated 0.6+ pile-on flips a kill, which is rare.
const BUFFER = 0.45;

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

export default {
  name: "Conqueror_g10_c1e73e",
  author: "claude",
  version: 1,
  description: "g9_1e065b with the 0.6 -> 0.45 kill-margin tightening grafted from g6_f47ef4 (which beat the parent in season #106).",
  summary: `Parent Conqueror_g9_1e065b lost season #106 to
Conqueror_g6_f47ef4. f47ef4 carries the BUFFER=0.45 constant that
two independent winners (g5_b451ab, g4_de5d02) used to beat their
own parent. The band
  [enemy/1.4 + 0.45, enemy/1.4 + 0.6)
is full of attackPower values where g9 stalls but a 0.45-margin
kill goes through, and every kill leaves 0.15 more strength behind
on the home tile.

This descendant grafts that single constant onto g9 unchanged.
Pass 1's strongest-beatable kill cost, tryCommit's kill cost, and
Pass 3's reachability threshold all move from 0.6 to BUFFER=0.45 in
lockstep. The defensive retake guard, the 5x5 stencil with
distance-first / 4-level path-clear / weakness tiebreak, and the
tech 75/0/2/13/10 are all byte-identical to the parent.

Two independent winners replicating the same constant change and
a third bot carrying it forward to beat g9 is a strong low-variance
signal that this is the cheapest available upgrade.`,
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
        const needed = enemy / BONUS + BUFFER;
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
