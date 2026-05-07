import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Stencil5 cell -> [primary dir, secondary dir]. Primary is the
// dominant-axis step (W=0, E=1, N=2, S=3); secondary is the off-axis
// step (or -1 if the cell sits exactly on one axis).
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

// Parent Conqueror_g4_868391 (closest-first 5x5 fallback) has two
// distinct holes that show up in head-to-head losses:
//
//   1. Pre-defer adjacency check is "any viable target" (free kill,
//      empty grab, or friendly with room), which then hands control
//      to Conqueror.act. Conqueror.act sorts by alignment kernel
//      score, NOT by enemy presence — so a beatable adjacent enemy
//      sitting in a low-alignment direction can lose priority to a
//      friendly-balance step in a higher-aligned direction. Three
//      cousins that beat the parent (g4_1f6790, g5_71ab3f, g5_cabbd8)
//      all add the same patch: explicitly kill the strongest beatable
//      adjacent enemy first. Adopted here verbatim — proven signal.
//
//   2. The 5x5 fallback picks a single best target (closest, weakest
//      tiebreak), tries its primary direction, then its secondary,
//      and gives up if both fail. tryCommit fails when the routed
//      direction is a maxed friendly (no room to balance) — which is
//      exactly the stalled-position scenario the fallback exists to
//      handle. If the closest beatable enemy's primary + secondary
//      both route through capped friendlies, the parent stalls, even
//      when a slightly farther beatable enemy has a different (and
//      reachable) prim/sec pair. New behavior: collect ALL beatable
//      candidates, sort closest-first / weakest-tiebreak (parent's
//      ordering preserved), walk them in order, attack on the first
//      successful tryCommit. Cost is a small array sort over <=16
//      cells — negligible vs the value of one extra push per stall.
//
// Tech unchanged: {move:90, stack:0, prod:2, atk:4, def:4} is the GA
// optimum every winning Conqueror cousin kept. The reserve thesis
// (low garrison, high mobility) is what makes the new walk-the-list
// fallback land more pushes per match — more attempts to flow out of
// stalls means more matches won by attrition rather than max-tick.
//
// When pass 1 finds no beatable adjacent enemy AND no other adjacent
// move is viable AND no 5x5 candidate is reachable, behavior matches
// the parent (return without action).
export default {
  name: "Conqueror_g5_fbf131",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 + strongest-beatable-adjacent priority kill + walk-all-candidates 5x5 fallback.",
  summary: `Two stacked patches on Conqueror_g4_868391, both targeting
distinct loss modes and neither breaking the parent's thesis.

Patch 1 — strongest-beatable-adjacent priority kill (cousins
g4_1f6790, g5_71ab3f, g5_cabbd8 all beat the parent with this).
Conqueror.act ranks directions by alignment kernel score, which can
deprioritize a free adjacent kill in favor of a friendly-balance in
a higher-aligned direction. Explicit pass 1 kills the strongest
beatable adjacent enemy with minimum-overkill sizing before deferring
to Conqueror.act. When no beatable adjacent enemy exists, behavior
in this pass is byte-identical to the parent.

Patch 2 — walk-all-candidates 5x5 fallback (novel). Parent picks one
"best" stencil target (closest, weakest tiebreak), tries primary then
secondary, gives up if both fail. tryCommit fails on capped-friendly
intermediate tiles, which is exactly the stalled-position scenario
the fallback is for. If the closest beatable enemy's prim+sec both
route through full friendlies, parent stalls — even when another
slightly-farther beatable enemy has a reachable prim/sec pair. New
behavior collects every beatable candidate in 5x5, sorts closest-
first with weakest as tiebreak (parent's exact ordering), and walks
them until one tryCommit succeeds. The same enemy parent picked is
still tried first; the change is only that "closest unreachable"
no longer ends the turn.

Tech unchanged at {move:90, stack:0, prod:2, atk:4, def:4} — the GA
optimum every winning cousin kept. The walk-the-list fallback
compounds especially well with low-garrison/high-mobility tech: more
successful pushes per stall is the whole bet.`,
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

    // Pass 1: strongest beatable adjacent enemy with minimum overkill.
    // Conqueror.act's kernel score can otherwise route past a free kill
    // in favor of a higher-aligned friendly balance — see header.
    let killTile = null;
    let killEnemy = -1;
    let killNeeded = 0;
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
      if (enemy > killEnemy) {
        killEnemy = enemy;
        killTile = t;
        killNeeded = needed;
      }
    }
    if (killTile) {
      army.attack(killTile, killNeeded);
      return;
    }

    // Pass 2: any other adjacent move (empty / friendly with room) -
    // defer to Conqueror.act so its alignment kernel picks the best
    // direction. Beatable enemies were already handled in pass 1;
    // remaining enemies here are unbeatable and skipped.
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

    // Pass 3: stalled. 5x5 walk-all-candidates fallback. Collect every
    // beatable enemy in the stencil, sort closest-first / weakest-
    // tiebreak (parent's exact ordering), and attack on the first
    // candidate whose primary or secondary direction tryCommit accepts.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    const candidates = [];
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
      candidates.push(dist, enemy, hints[0], hints[1]);
    }
    if (candidates.length === 0) return;

    // Bubble-sort the flat tuples since the array is tiny (<=16 entries
    // typically a handful) and this avoids per-call allocation of
    // closures or wrapper objects.
    const n = candidates.length / 4;
    for (let a = 0; a < n - 1; a++) {
      for (let b = 0; b < n - 1 - a; b++) {
        const ai = b * 4;
        const bi = ai + 4;
        const ad = candidates[ai];
        const bd = candidates[bi];
        const swap = ad > bd || (ad === bd && candidates[ai + 1] > candidates[bi + 1]);
        if (swap) {
          for (let s = 0; s < 4; s++) {
            const tmp = candidates[ai + s];
            candidates[ai + s] = candidates[bi + s];
            candidates[bi + s] = tmp;
          }
        }
      }
    }

    for (let c = 0; c < n; c++) {
      const ci = c * 4;
      const prim = candidates[ci + 2];
      const sec = candidates[ci + 3];
      const primaryTarget = neighbors[prim];
      if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
      if (sec < 0) continue;
      const secondaryTarget = neighbors[sec];
      if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
    }
  },
};
