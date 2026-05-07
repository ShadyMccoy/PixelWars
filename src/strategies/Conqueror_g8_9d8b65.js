import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.6;
const BACKING_WEIGHT = 0.4;

// Hemisphere indices for the 5x5 stencil. W=0, E=1, N=2, S=3 -> the
// stencil cells on that side, with axis cells excluded so hemispheres
// don't overlap. Used to score adjacent kill candidates by how much
// enemy mass sits behind each direction.
const HEMI = (() => {
  const w = [], e = [], n = [], s = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const idx = i * 5 + j;
      const dx = j - 2;
      const dy = i - 2;
      if (dx < 0) w.push(idx);
      if (dx > 0) e.push(idx);
      if (dy < 0) n.push(idx);
      if (dy > 0) s.push(idx);
    }
  }
  return [w, e, n, s];
})();

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

// Parent Conqueror_g7_b36709 lost season #67 in two seeds. In seed=16
// the bot that beat parent was Conqueror_g7_3b651e — a sibling that
// upgraded the same kernel two ways:
//
//   - Pass 1 (adjacent kill) uses hemisphere-weighted scoring:
//     score = enemy + 0.4 * sum of enemy strength behind that side.
//     Parent's "strongest beatable" picker ignored stencil context,
//     so a beatable enemy with deep backing kept losing priority to
//     a smaller adjacent body. This is the head-to-head fix.
//
//   - Pass 3 (5x5 stencil fallback) adds a path-clear tiebreak so
//     among equally-close stencil targets, the bot picks the one
//     whose primary cardinal lane is currently passable. Converts
//     more stencil intent into one-tick motion during stalemates.
//
// These two changes fire on disjoint entry conditions (Pass 1 fires
// only when a beatable adjacent enemy exists; Pass 3 fires only when
// every neighbor is full-friendly or unbeatable enemy), so adopting
// both wholesale is mechanical, not a redesign.
//
// Second bet — tech. Parent's design comment assumed lab1 has
// maxArmy=6, but lab1's current spec is 30x22 growth 1.8 maxArmy=12.
// At maxArmy=12 the stack knob has real leverage: stack=2 caps at
// roughly 0.82 * 12 ≈ 9.8 strength, while stack=20 (neutral) caps
// at 12. Parent's 90/2/2/3/3 traded a 22% storage penalty for an
// 0.1 garrison saving, which made sense at maxArmy=6 (cap was 4.9
// vs 6, ~18%) but is the wrong sign on a bigger map.
//
// Shift 10 points from move to stack: 80/12/2/3/3. Garrison floor
// rises 0.6 -> 0.7 (cost: 0.1 strength held back per attack), and
// stack returns to roughly neutral (cap recovers ~22%). On lab1's
// larger board with longer push paths and bigger growth pools, the
// cap ceiling matters more than the marginal per-attack garrison.
export default {
  name: "Conqueror_g8_9d8b65",
  author: "claude",
  version: 1,
  description: "Adopts g7_3b651e's hemisphere-weighted Pass 1 + path-clear Pass 3, and shifts move->stack for lab1's maxArmy=12.",
  summary: `Parent Conqueror_g7_b36709 lost season #67 in two seeds.
In seed=16 the winner was Conqueror_g7_3b651e, a sibling that beat
parent head-to-head with two upgrades on the same kernel:

  Pass 1 — HEMISPHERE-WEIGHTED ADJACENT KILL. Parent picked the
  strongest beatable adjacent enemy with no awareness of stencil
  context. The sibling scores each candidate as
    enemy + 0.4 * sum(enemy strength in that side's hemisphere)
  so a kill that defangs deep backing is preferred over a kill
  that just removes the largest adjacent body. Membrane-style
  facade matchups punish the cheap heuristic; the weighted score
  fixes them.

  Pass 3 — PATH-CLEAR STENCIL TIEBREAK. Among equally-close
  beatable stencil targets, prefer the one whose primary cardinal
  lane is currently passable (empty / friendly with refill room /
  beatable enemy), with weakness as final tiebreak. Converts more
  stencil intent into actual one-tick motion during stalemates.

These two changes fire on disjoint entry conditions and compose
mechanically, so adopting both is the obvious move.

Second, smaller bet — tech. Parent's design notes assumed lab1 had
maxArmy=6, but the current lab1 spec is 30x22, growth 1.8,
maxArmy=12. With a 12 cap, the stack knob has real leverage and
parent's stack=2 was paying ~22% storage in exchange for a 0.1
garrison saving — a trade that fit a maxArmy=6 board but not a
12 one. Shift 10 points move->stack: 80/12/2/3/3.
  Garrison floor: 0.6 -> 0.7 (cost: 0.1 strength held back).
  Stack: ~0.82x -> ~1.0x cap (recovers ~22% storage).
On a larger board with longer push paths, the cap ceiling matters
more than the marginal per-attack garrison.

If this descendant underperforms its lineage, the takeaway is
either (a) the maxArmy=12 stack premium is smaller than the model
suggests, or (b) the head-to-head loss in seed=16 was variance
and parent's simpler Pass 1 was actually the right call.`,
  tech: { move: 80, stack: 12, prod: 2, atk: 3, def: 3 },
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
    const stencil = tile.stencil5;
    const viewer = army.player;

    // Pass 1: hemisphere-weighted adjacent kill picker.
    let bestTile = null;
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

        let backing = 0;
        if (stencil) {
          const idxs = HEMI[i];
          for (let k = 0; k < idxs.length; k++) {
            const cell = stencil[idxs[k]];
            if (!cell) continue;
            const cArmies = cell.armies;
            if (cArmies.length === 0) continue;
            const e = -sumStrength(cArmies, viewer);
            if (e > 0) backing += e;
          }
        }
        const score = enemy + BACKING_WEIGHT * backing;
        if (score > bestScore) {
          bestScore = score;
          bestTile = t;
          bestNeeded = needed;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }
    if (bestTile) {
      army.attack(bestTile, bestNeeded);
      return;
    }

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 stencil with distance-first,
    // path-clear tiebreak, weakness as final tiebreak.
    if (!stencil) return;

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
      const clear = isPassable(hints[0]);
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
