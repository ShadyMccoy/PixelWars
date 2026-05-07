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

// Parent Conqueror_g5_60c874 dominated season #25, but its 5x5 fallback
// has a residual stall pattern: it locks onto the single best stencil
// target (closest, weakest as tiebreak), tries that target's primary
// then secondary axis, and gives up if both are blocked. When the army
// is stalled in a contested front, the primary/secondary neighbors of
// the best target are often themselves unbeatable enemies (precisely
// why hasAdjacentTarget was false to begin with) — so the army idles
// even when other 5x5 candidates could be approached through different
// directions.
//
// This descendant rolls per-direction scoring instead. For each of the
// four axes, we record the best (lowest-score) viable stencil target
// reachable through that axis as either primary or secondary. We then
// walk axes in score order, calling tryCommit on the neighbor for each.
// First success wins. The score formula `dist * 1024 + enemy` keeps the
// parent's "closest, then weakest" priority for the chosen axis, but
// once the top axis is blocked we fall through to the next axis whose
// best target is still better than nothing — instead of returning.
//
// The common case (top axis works) is unchanged in outcome and only
// pays a small constant scan cost. The change matters in cluttered
// fronts where the parent would idle a tick; here we make whatever
// progress is reachable and re-evaluate next tick.
export default {
  name: "Conqueror_g6_feb914",
  author: "claude",
  version: 1,
  description: "Conqueror_g5 with per-axis 5x5 scoring so a blocked top target falls through to other reachable directions.",
  summary: `Parent Conqueror_g5_60c874 ran the table in season #25. Its 5x5
fallback picks one best target and tries that target's primary then
secondary axis; if both fail, the army idles. But the very condition
that triggers the fallback (hasAdjacentTarget false) means EVERY
adjacent neighbor was either off-grid, a maxed friendly, or an
unbeatable enemy — so blocking on primary+secondary of the best
target is the common case, not the rare one, and the army loses a
tick of forward pressure.

This descendant scores each of the four axes by the best stencil
target reachable through it (as primary or secondary), using the
parent's `dist * K + enemy` priority. It then walks axes in score
order calling tryCommit; first success wins. The chosen direction
matches the parent's when the top target's primary axis is reachable
(which is the unchanged common case). When that axis is blocked, we
now try the next axis with any viable target instead of stalling.

Everything else is byte-identical to the parent: hasAdjacentTarget
short-circuit to Conqueror.act, BONUS=1.4, the selection threshold
`enemy <= (sLimit - 0.6) * BONUS` matched to tryCommit's commit gate,
DIR_HINTS routing, tryCommit, and tech.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;

    // Defer to Conqueror whenever any adjacent move is viable: free
    // kill, empty grab, or a friendly with room to be balanced toward.
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

    // Stalled: per-axis 5x5 score. Each axis records the best (lowest)
    // dist*K+enemy score among stencil cells whose primary or secondary
    // routes through it. Then walk axes by score and try tryCommit on
    // each neighbor; first success wins.
    if (!tile.stencil5 || sLimit <= 0.5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const maxEnemy = (sLimit - 0.6) * BONUS;
    if (maxEnemy <= 0) return;

    const dirScore = [Infinity, Infinity, Infinity, Infinity];
    for (let i = 0; i < 25; i++) {
      const hints = DIR_HINTS[i];
      if (hints[0] < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const enemy = -sumStrength(t.armies, viewer);
      if (enemy <= 0 || enemy > maxEnemy) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      // dist dominates (range 1..4 << 1024); enemy breaks ties by
      // weakest, matching the parent's bestDist/bestEnemy ordering.
      const score = dist * 1024 + enemy;
      const p = hints[0];
      if (score < dirScore[p]) dirScore[p] = score;
      const s = hints[1];
      if (s >= 0 && score < dirScore[s]) dirScore[s] = score;
    }

    // Insertion-sort 4 directions by score (4! = 24 ops, no alloc).
    const order = [0, 1, 2, 3];
    for (let i = 1; i < 4; i++) {
      const key = order[i];
      const keyScore = dirScore[key];
      let j = i - 1;
      while (j >= 0 && dirScore[order[j]] > keyScore) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = key;
    }

    for (let i = 0; i < 4; i++) {
      const d = order[i];
      if (dirScore[d] === Infinity) return;
      const t = neighbors[d];
      if (t && tryCommit(army, t, sLimit, pid)) return;
    }
  },
};
