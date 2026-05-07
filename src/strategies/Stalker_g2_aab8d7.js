import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";
import Trinity from "./Trinity.js";

const BONUS = 1.45;

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

// Two of the five season-#3 losses were max-tick stalls. Parent's
// stencil scan picks the WEAKEST beatable enemy with distance only
// as tiebreaker, so a distant weakling can drag us away from a
// closer fight; and when the 5x5 is enemy-free the bot returns
// idle. Three changes versus parent:
//   1. tech: atk/move-leaning loadout. atk lifts more borderline
//      kills past the beatability gate, move (smaller garrison)
//      lets each attack commit more strength. Both reduce stalls.
//   2. Stencil tiebreak: closer first, weaker only on ties. Less
//      misdirection toward distant prey across friendly territory.
//   3. Whenever the scan or the chosen target falls through, run
//      Trinity instead of idling. Friendly-flocking keeps motion,
//      which is what's missing in max-tick games.
export default {
  name: "Stalker_g2_aab8d7",
  author: "claude",
  version: 1,
  description: "Stalker w/ atk-move tech, closer-enemy preference, Trinity fallback to break stalls.",
  summary: `Stalker_g1_86aa0f lost two of five season-#3 games to
max-tick stalemates and a third to Crusader's straight-up kill loop.
This descendant keeps the 1.45 BONUS lever but addresses the stall
mode in three small ways. (a) tech {move:30, stack:10, prod:15,
atk:30, def:15}: atk widens the beatable set just like a higher
BONUS would but at engine resolution time, and lower garrison from
move=30 means each commit pushes more strength. (b) The 5x5 stencil
search now sorts by Manhattan distance first, enemy strength as
tiebreaker — the parent's weakest-first ordering can wander past a
closer winnable fight, costing tempo. (c) Every dead-end (no stencil
target, target tile gone, friendly maxed, or enemy too strong on
arrival) now falls back to Trinity instead of returning. Trinity's
friendly-flocking guarantees forward motion when the local
neighborhood is otherwise quiet — which is exactly the situation
that produced the two 4000-tick losses.`,
  tech: { move: 30, stack: 10, prod: 15, atk: 30, def: 15 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;

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

    if (!tile.stencil5 || sLimit <= 0.5) {
      Trinity.act(army, game);
      return;
    }
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestDir = -1;
    let bestDist = Infinity;
    let bestEnemy = Infinity;
    for (let i = 0; i < 25; i++) {
      const dir = DIR_HINT[i];
      if (dir < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const enemy = -sumStrength(t.armies, viewer);
      if (enemy <= 0) continue;
      if (enemy / BONUS > sLimit + 0.5) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      if (dist < bestDist || (dist === bestDist && enemy < bestEnemy)) {
        bestEnemy = enemy;
        bestDist = dist;
        bestDir = dir;
      }
    }
    if (bestDir < 0) {
      Trinity.act(army, game);
      return;
    }
    const target = neighbors[bestDir];
    if (!target) {
      Trinity.act(army, game);
      return;
    }
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
      if (needed > sLimit) {
        Trinity.act(army, game);
        return;
      }
      army.attack(target, needed);
      return;
    }
    if (friendlyArmy) {
      if (friendlyArmy.strength >= friendlyArmy.maxStrength - 0.5) {
        Trinity.act(army, game);
        return;
      }
      const room = friendlyArmy.maxStrength - friendlyArmy.strength;
      const power = Math.min(sLimit, room);
      if (power > 0.5) army.attack(target, power);
      return;
    }
    army.attack(target, sLimit);
  },
};
