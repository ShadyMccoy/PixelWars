import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const BUFFER = 0.45;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.4;

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

// Parent's Pass 3 (stencil fallback) picked the weakest beatable
// target first and used closest as a tiebreak. All three cousins
// that beat the parent in season #114 (g9_d2499d, g8_5c68e4,
// g6_27c4e7) instead pick the CLOSEST beatable target first and
// use weakest only as a tiebreak.
//
// Why closest-first should win: parent's losing games went long
// (560-627 ticks), and Pass 3 fires when the army is stalled with
// no adjacent action. Going for a far weak target means many
// ticks of travel during which the picture changes - the target
// reinforces, the path closes, or the army is needed elsewhere.
// A closer target resolves immediately and frees the army for
// the next decision; the kill cost is identical (same BONUS+BUFFER
// formula) so we lose nothing structural by being greedier on
// distance.
//
// Single one-line behavior change in the Pass 3 selection
// predicate. Pass 1 (retake-aware scoring with RETAKE_W/FRIENDLY_W
// /RETAKE_VETO), Pass 2 (Conqueror.act), the BUFFER constant,
// and tech are all unchanged from the parent.
export default {
  name: "Conqueror_g5_5c2521",
  author: "claude",
  version: 1,
  description: "Parent g4_de5d02 with Pass 3 reordered: closest beatable first, weakest as tiebreak (matches all 3 season-#114 winners).",
  summary: `Parent Conqueror_g4_de5d02 lost season #114 in three
games that all ran long (435-627 ticks). The three bots that beat
it (g9_d2499d, g8_5c68e4, g6_27c4e7) all share one Pass 3 ordering
choice the parent does not: closest beatable target first, weakest
as tiebreak. The parent does the opposite - weakest first, closest
as tiebreak.

Hypothesis: long games hurt the parent because Pass 3 (stalemate
fallback) commits to a far weak target when a near one was
available. Marching toward a distant prey leaves the army
locked-in for many ticks of travel where the situation drifts
out from under it. A closer kill resolves immediately and frees
the army for the next decision, with identical kill cost (same
enemy/BONUS + BUFFER formula).

This is a one-line change to the Pass 3 selection predicate -
swap (enemy first, dist tiebreak) for (dist first, enemy
tiebreak). Pass 1's retake-aware scoring (RETAKE_W=0.8,
FRIENDLY_W=0.4, RETAKE_VETO=1.4), Pass 2's Conqueror.act
delegation, BUFFER=0.45, and the lineage's shared tech
{move:90, stack:0, prod:2, atk:4, def:4} are all unchanged.`,
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

    // Pass 2: any other adjacent action.
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

    // Pass 3: stalled. 5x5 fallback - closest beatable first,
    // weakest as tiebreak (was: weakest first, closest tiebreak).
    if (!tile.stencil5) return;
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
        bestDist = dist;
        bestEnemy = enemy;
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
