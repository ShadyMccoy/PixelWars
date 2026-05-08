import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent g7_3b651e ran MARGIN=0.6. Sibling Conqueror_g4_de5d02 (the
// season #84 seed=5 winner that beat the parent) ran BUFFER=0.45 in
// the same enemy/BONUS+MARGIN formula. The band
// [enemy/1.4+0.45, enemy/1.4+0.6) is full of attackPower values where
// the parent stalls but a 0.45 margin kills cleanly, and every kill
// also leaves an extra 0.15 strength on the home tile. The constant
// is load-bearing in both Pass 1 and the Pass 3 commit path.
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
// Free-retake veto, copied from g4_de5d02. With MARGIN=0.45 a
// minimum-cost kill leaves a ~0.63 survivor; a 1.4+ adjacent enemy
// backup retakes it at minimum cost (1.4/1.4 = 1.0 needed vs 0.63),
// netting the opponent ~0.45 free strength. Skip those trades — they
// are strictly tempo-negative. Below 1.4 the backup either misses or
// pays enough that the kill is still net-positive for us.
const RETAKE_VETO = 1.4;

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

// Parent Conqueror_g7_3b651e lost season #84 seed=5 (finished #3 of
// 6) to sibling Conqueror_g4_de5d02. g4 carries two improvements
// the parent lacks, both of which compose cleanly with the parent's
// hemisphere-weighted Pass 1:
//
//   1. BUFFER=0.45 in place of MARGIN=0.6. Same enemy/BONUS+MARGIN
//      kill formula, just a tighter constant. Closes the
//      [enemy/1.4+0.45, enemy/1.4+0.6) band where the parent stalls
//      but a 0.45-margin attack kills cleanly. Every successful kill
//      also leaves an extra 0.15 strength on the home tile, which
//      compounds over a long match.
//
//   2. RETAKE_VETO=1.4. Before committing a kill, scan the target's
//      other cardinal neighbors. If any one of them holds 1.4+ enemy
//      strength, skip the kill — that backup retakes the survivor
//      (~0.63 with MARGIN=0.45) at minimum cost, netting the
//      opponent ~0.45 free strength. Strictly tempo-negative.
//
// Both improvements operate as PRE-FILTERS on Pass 1's candidate
// set. The parent's hemisphere-weighted score still picks among the
// survivors. The veto is a single per-target check; the margin
// change is one constant that propagates into tryCommit (Pass 3).
//
// Path-clear stencil tiebreak (Pass 3) is unchanged from g7.
// Tech unchanged at 90/0/2/4/4 — the shared optimum across the
// winning Conqueror lineage; no signal to perturb it.
export default {
  name: "Conqueror_g8_579783",
  author: "claude",
  version: 1,
  description: "g7_3b651e + g4_de5d02's tightened kill margin (0.45) and retake-veto.",
  summary: `Parent Conqueror_g7_3b651e finished #3 of 6 in season
#84 seed=5, beaten by sibling Conqueror_g4_de5d02. g4 is the line
that ported g5_b451ab's tightened kill margin (BUFFER 0.6 -> 0.45)
and added a retake veto on top.

g8_579783 keeps g7's three-pass kernel and grafts on those two
improvements, both of which act as pre-filters on Pass 1 candidates
without disturbing the hemisphere-weighted scorer that picks among
survivors:

1. MARGIN tightened from 0.6 to 0.45. Same enemy/BONUS+MARGIN
   formula, one-constant change. Picks up kills the parent stalled
   on, saves 0.15 strength on home per kill, and propagates into
   tryCommit (Pass 3) too.

2. RETAKE_VETO=1.4 added to Pass 1. Before committing a kill, scan
   the target's other three cardinal neighbors. If any holds 1.4+
   enemy strength, skip the kill — that backup retakes the ~0.63
   survivor at minimum cost, a strictly tempo-negative trade.

The hemisphere-weighted score is preserved verbatim and still
selects among the non-vetoed candidates, so the parent's offensive
edge against Membrane-style facades is intact while the defensive
holes that g4 exploited are patched.

Pass 3's closest-first 5x5 stencil with path-clear tiebreak is
unchanged. Tech unchanged at 90/0/2/4/4.`,
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
    const stencil = tile.stencil5;
    const viewer = army.player;

    // Pass 1: hemisphere-weighted adjacent kill picker, gated by
    // tightened MARGIN and retake-veto pre-filters.
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

        // Free-retake veto: max enemy strength on the target's other
        // cardinal neighbors. A 1.4+ backup retakes the ~0.63
        // survivor at min cost — strictly tempo-negative.
        let backup = 0;
        const tn = t.neighbors;
        for (let j = 0; j < 4; j++) {
          const tt = tn[j];
          if (!tt || tt === tile) continue;
          const ttArmies = tt.armies;
          let tnE = 0;
          for (let k = 0; k < ttArmies.length; k++) {
            const a = ttArmies[k];
            if (a.player.id !== pid) tnE += a.strength;
          }
          if (tnE > backup) backup = tnE;
        }
        if (backup >= RETAKE_VETO) {
          // Vetoed kill is still an "other adjacent target" for the
          // Pass 2 fallback — Conqueror.act may handle it differently
          // (e.g. balance, wait), and we don't want to drop into the
          // stalemate path while a beatable enemy sits next to us.
          hasOtherTarget = true;
          continue;
        }

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

    // Pass 3: full stalemate. 5x5 with distance-first, path-clear
    // tiebreak, weakness as final tiebreak. Inherited from
    // g6_aa7266 via g7_3b651e. tryCommit uses the tightened MARGIN.
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
