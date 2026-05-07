import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const GROWTH_BANK = 0.75;

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

// Parent Conqueror_g4_1f6790 added strongest-beatable-adjacent-enemy
// priority (Crusader-style patch) but kept NO fallback for stalled
// positions: when no adjacent move is viable, it just defers to
// Conqueror, which sorts by alignment kernel and can silently idle
// when nothing aligned is reachable. Two of five season #8 losses
// were max-tick stalls vs Stalker_g1_8767f6 (seed=247, seed=51,
// both 4000 ticks). That's the exact failure mode the Stalker
// lineage's 5x5 distant-prey scan was built to fix - and the bot
// that beat us in those games is the one with the most permissive
// version of that scan (growth bank +0.75).
//
// This descendant keeps g4's priority kill verbatim at the front
// (still strongest, still minimum-overkill, still preserves the
// move-heavy 90/0/2/4/4 reserve thesis) and ADDS Stalker_g1_8767f6's
// permissive 5x5 fallback after Conqueror would otherwise idle.
//
// Strongest-adjacent / weakest-distant asymmetry is intentional:
// adjacent enemies are immediate threats so we defang the biggest
// (Membrane stall lesson from the g4 thesis); distant prey is an
// expansion target so we pick the easiest snack (Stalker thesis).
// Same actual-attack guards on the final adjacent step, so no
// suicide risk introduced.
export default {
  name: "Conqueror_g5_71ab3f",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 + Stalker_g1_8767f6's permissive 5x5 distant-prey fallback to break stalls.",
  summary: `Parent Conqueror_g4 has no fallback when stalled - it
defers to Conqueror's alignment kernel which can idle. Two of five
recent losses are max-tick stalls vs Stalker_g1_8767f6, the bot
that built its identity around exactly this scan. Add it back:
keep g4's strongest-beatable-adjacent-enemy priority (Crusader
patch) at the front, then if no adjacent move is viable scan the
5x5 stencil for the weakest beatable enemy with growth bank +0.75
and step along its dominant axis. Same adjacent guards Stalker
uses on the final commit. Strongest-near, weakest-far is by
design: defang biggest local threat, snack on easiest distant
target. Tech unchanged - GA-discovered 90/0/2/4/4 still optimal.`,
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

    // g4 priority: kill strongest beatable adjacent enemy first.
    let bestTile = null;
    let bestEnemy = -1;
    let bestNeeded = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      let friendly = false;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      const needed = enemy / BONUS + 0.6;
      if (needed > sLimit) continue;
      if (enemy > bestEnemy) {
        bestEnemy = enemy;
        bestTile = t;
        bestNeeded = needed;
      }
    }
    if (bestTile) {
      army.attack(bestTile, bestNeeded);
      return;
    }

    // Check whether any adjacent move is viable (empty tile or
    // friendly with room). Beatable enemies were already handled;
    // any remaining enemy here is unbeatable so we skip those.
    let hasAdjacentTarget = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) { hasAdjacentTarget = true; break; }
      let friendlyArmy = null;
      let hasEnemy = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else hasEnemy = true;
      }
      if (hasEnemy) continue;
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasAdjacentTarget = true;
        break;
      }
    }
    if (hasAdjacentTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Stalled: Stalker_g1_8767f6's 5x5 weakest-prey scan with
    // growth bank +0.75.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestDir = -1;
    let bestDistEnemy = Infinity;
    let bestDist = 0;
    for (let i = 0; i < 25; i++) {
      const dir = DIR_HINT[i];
      if (dir < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const enemy = -sumStrength(t.armies, viewer);
      if (enemy <= 0) continue;
      if (enemy / BONUS > sLimit + GROWTH_BANK) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      if (enemy < bestDistEnemy || (enemy === bestDistEnemy && dist < bestDist)) {
        bestDistEnemy = enemy;
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
      const needed = enemy / BONUS + 0.6;
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
