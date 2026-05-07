import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.4;
const TERRITORY_BIAS = 0.3;

// Stencil5 cell -> [primary dir, secondary dir]. W=0, E=1, N=2, S=3.
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
    const needed = enemy / BONUS + MARGIN;
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

// Parent g8_a9c587 lost season #67 seed 184 to Conqueror_g5_930cc7
// (and finished #3 of 6 on seed 96, where Frontier won). The g5
// winner differs from g8 in exactly one place: Pass 1 kill priority
// is weighted by territorial support of the candidate tile,
//   score = enemy + 0.3 * friendlyNbrs   (max +1.2 at 4 friendlies)
// where friendlyNbrs counts adjacent tiles with ownerId === pid.
//
// The bias flips ranking only on near-ties. Clear membrane threats
// still get killed first (Membrane defense thesis intact), but a
// deeply-infiltrated enemy with all-friendly neighbors now outranks
// a slightly-larger frontier enemy floating in enemy territory.
// That's the right call: the infiltration kill collapses a wound
// inside our position, and the captured tile is likelier to hold
// next tick because friendlies can reinforce. g8's pure
// strongest-beatable rule misses the wound-collapse case entirely
// — it just hits the biggest visible enemy and frontier kills get
// retaken.
//
// This descendant ports that single change into g8's three-pass
// structure. Pass 1 gets the territory bias. Pass 2 (Conqueror.act
// on any other adjacent action) and Pass 3 (5x5 stencil with
// two-axis path-clear: distance-first, clear, weakness-last) are
// preserved verbatim from g8 so the parent's stalemate-routing
// contribution stays intact. MARGIN stays at 0.4 (g8's value).
// Tech unchanged at {move:90, stack:0, prod:2, atk:4, def:4} — the
// shared optimum across the winning Conqueror cousin lineage.
export default {
  name: "Conqueror_g9_c81d7f",
  author: "claude",
  version: 1,
  description: "g8 with territory-bias kill scoring (enemy + 0.3*friendlyNbrs) imported from g5_930cc7, which beat the parent in season #67.",
  summary: `Parent Conqueror_g8_a9c587 lost season #67 seed 184 to
Conqueror_g5_930cc7 and finished #3 of 6 on seed 96 (Frontier won).
g5_930cc7's only meaningful difference from g8's Pass 1 is a
territory-bias kill score: instead of pure strongest-beatable, it
ranks adjacent kill candidates by enemy + 0.3*friendlyNbrs, where
friendlyNbrs counts adjacent tiles whose ownerId is ours (max +1.2
when all 4 are friendly).

That small bias only flips ranking on near-ties. Clear membrane
threats still get killed first (Membrane defense thesis intact),
but a deeply-infiltrated enemy backed by all friendly neighbors now
outranks a slightly-larger frontier enemy floating in enemy
territory. The infiltration kill collapses a wound inside our
position, and the captured tile is likelier to hold next tick
because friendlies can reinforce. g8's pure strongest-beatable
rule misses that wound-collapse case — it just hits the biggest
enemy and frontier kills get retaken next tick.

This descendant ports that single change into g8's three-pass
structure. Pass 1 gets the territory bias. Pass 2 (Conqueror.act
on any other adjacent action) and Pass 3 (5x5 stencil with
two-axis path-clear, distance-first / clear / weakness-last) are
preserved verbatim from g8 so the parent's stalemate-routing
contribution stays intact. MARGIN stays at 0.4 (g8's value); the
diff is strictly the scoring expression in Pass 1. Tech unchanged
at {move:90, stack:0, prod:2, atk:4, def:4}.`,
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

    // Pass 1: best beatable adjacent enemy by
    //   score = enemy + TERRITORY_BIAS * friendlyNbrs
    // (territory-bias kill priority — imported from g5_930cc7,
    // which beat the parent in season #67).
    let bestKill = null;
    let bestScore = -1;
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
        const needed = enemy / BONUS + MARGIN;
        if (needed > sLimit) continue;
        let friendlyNbrs = 0;
        const tn = t.neighbors;
        for (let n = 0; n < 4; n++) {
          const nt = tn[n];
          if (nt && nt.ownerId === pid) friendlyNbrs++;
        }
        const score = enemy + TERRITORY_BIAS * friendlyNbrs;
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

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 stencil with distance-first,
    // two-axis path-clear tiebreak, weakness as final tiebreak.
    if (!tile.stencil5) {
      Conqueror.act(army, game);
      return;
    }
    const stencil = tile.stencil5;
    const viewer = army.player;

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
    if (bestPrim < 0) {
      Conqueror.act(army, game);
      return;
    }

    const primaryTarget = neighbors[bestPrim];
    if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
    if (bestSec < 0) {
      Conqueror.act(army, game);
      return;
    }
    const secondaryTarget = neighbors[bestSec];
    if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
    Conqueror.act(army, game);
  },
};
