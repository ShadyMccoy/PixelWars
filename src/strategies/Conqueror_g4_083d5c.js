import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Score weight added per non-self-owned neighbor of an adjacent kill
// target. Favors kills that open onto more unowned/enemy frontier so
// the army's next tick has more empty-grab options.
const FRONTIER_WEIGHT = 0.5;

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

function frontierCount(t, pid) {
  const ns = t.neighbors;
  let count = 0;
  for (let i = 0; i < 4; i++) {
    const n = ns[i];
    if (!n) continue;
    if (n.ownerId !== pid) count++;
  }
  return count;
}

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

// Parent Conqueror_g3_c24a38 dominated season #21 (no recent losses
// recorded) running the unified 3-pass kernel: g4-style strongest-
// beatable-adjacent kill, then defer to Conqueror.act for empty/balance
// neighbors, then a g3-style 2-step stencil5 fallback when fully boxed.
//
// Since there are no concrete losses to fix, this descendant explores
// a co-factor in pass 1's adjacent-kill priority. The parent picks the
// strongest beatable enemy (best threat removal). That works, but it
// ignores positional value: a kill that opens onto 3 unowned tiles is
// strictly better than one that opens into our own backfield, all else
// equal, because the next tick's Conqueror.act has more empty-grab
// targets from the new tile. We add FRONTIER_WEIGHT * (non-self-owned
// neighbors of the kill target) to the score, breaking near-ties in
// favor of expansion-friendly kills while still preferring high-threat
// targets when their strength dominates the bonus. Min-overkill sizing,
// passes 2/3, and tech are unchanged.
export default {
  name: "Conqueror_g4_083d5c",
  author: "claude",
  version: 1,
  description: "Conqueror_g3 with frontier-weighted adjacent-kill scoring.",
  summary: `Parent dominated season #21 with the unified 3-pass kernel
(strongest-beatable-adjacent kill, defer to Conqueror.act on
empty/balance neighbors, g3-style 2-step stalemate fallback).
Without concrete losses to attack, this descendant tweaks pass 1's
kill priority: instead of pure strongest-enemy, score each beatable
target as enemy_strength + ${0.5} * (non-self-owned neighbors of
target). High-threat enemies still win when their strength clearly
dominates, but near-ties resolve toward kills that open more
expansion frontier - so the next tick's Conqueror.act inherits a
position with more empty-grab options. Conservative weight (0.5)
keeps the threat-removal thesis intact; pass 2/3 and tech unchanged.`,
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

    // Pass 1: highest-value beatable adjacent enemy. Score combines
    // threat (enemy strength) and positional value (frontier opened).
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
      if (enemy > 0) {
        const needed = enemy / BONUS + 0.6;
        if (needed > sLimit) continue;
        const score = enemy + FRONTIER_WEIGHT * frontierCount(t, pid);
        if (score > bestScore) {
          bestScore = score;
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

    // Pass 2: any other adjacent action viable -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. Look 2 deep for the weakest beatable
    // enemy and step toward it (g3-style), trying off-axis if the
    // primary neighbor is blocked.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestPrim = -1;
    let bestSec = -1;
    let bestWeak = Infinity;
    let bestDist = 0;
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
      if (enemy < bestWeak || (enemy === bestWeak && dist < bestDist)) {
        bestWeak = enemy;
        bestDist = dist;
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
