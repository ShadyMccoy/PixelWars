import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const BACKING_WEIGHT = 0.4;

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

// Per cardinal direction (W=0, E=1, N=2, S=3): the stencil5 indices
// strictly in that hemisphere (excludes the orthogonal axis so the
// four hemispheres don't double-count cells directly beside us).
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

function tryNoMarginKill(army, neighbors, sLimit, pid) {
  if (sLimit <= 0.5) return false;
  const myMults = army.player.techMults;
  const atkMult = (myMults && myMults.atk) || 1;
  const effBonus = BONUS * atkMult;
  let best = null;
  let bestEnemy = Infinity;
  for (let i = 0; i < 4; i++) {
    const t = neighbors[i];
    if (!t) continue;
    const tArmies = t.armies;
    if (tArmies.length === 0) continue;
    let enemy = 0;
    let mixed = false;
    let maxDef = 1;
    for (let k = 0; k < tArmies.length; k++) {
      const a = tArmies[k];
      if (a.player.id === pid) {
        mixed = true;
        continue;
      }
      enemy += a.strength;
      const dm = (a.player.techMults && a.player.techMults.def) || 1;
      if (dm > maxDef) maxDef = dm;
    }
    if (enemy <= 0) continue;
    if (mixed) continue;
    const killCeiling = (sLimit * effBonus) / maxDef - 0.05;
    if (enemy >= killCeiling) continue;
    if (enemy < bestEnemy) {
      bestEnemy = enemy;
      best = t;
    }
  }
  if (best) {
    army.attack(best, sLimit);
    return true;
  }
  return false;
}

// Hypothesis: parent g8_c3d8b0 lost season #121 across four seeds to
// g6_53407c, g8_3280dd, g9_469924, and g9_5c4555. The recurring
// behavioral edge those winners share - and which the parent does
// NOT have - is hemisphere-weighted Pass 1 adjacent kill scoring:
//
//   score = enemy + 0.4 * sum(enemy mass in that cardinal's
//                             stencil5 hemisphere)
//
// The parent's adjacent decision goes through `hasAdjacentTarget` ->
// `Conqueror.act`, which scores adjacent kills purely by raw enemy
// strength (or whatever Conqueror's kernel does internally). When
// two adjacent enemies are comparable, Conqueror.act picks the
// thinnest facade; the winners pick the side with more enemy mass
// behind it - the wall worth puncturing.
//
// This descendant grafts that Pass 1 onto the parent. Concretely:
// the `hasAdjacentTarget` short-circuit is replaced with explicit
// hemisphere-weighted Pass 1 (kill) followed by a Pass 2 fallback
// to Conqueror.act for non-kill adjacent actions (grabs, moves into
// not-yet-full friendly armies). The 5x5 stencil routing (Pass 3)
// and the no-margin kill (Pass 4) are byte-identical to the parent.
//
// Tech is preserved at the parent's distinctive setting
// {move:85, stack:0, prod:2, atk:9, def:4}. The parent's atk=9 was
// chosen specifically to widen the no-margin kill window, and that
// reasoning still applies in Pass 4. The new Pass 1 also benefits
// from the higher atk: hemisphere-weighted scoring picks the wall
// to punch, and atk=9 (vs the cousin lineage at atk=4) makes the
// punch land harder once chosen. The risk is move=85 vs the
// cousins' move=90 (a ~0.025 garrison-floor disadvantage), but the
// parent already paid that cost; this descendant just gives the
// parent a better adjacent kill scorer to compose with it.
//
// The smallest reviewable graft: only the adjacent-decision block
// changes; Pass 3 and Pass 4 are untouched. Tech is untouched.
export default {
  name: "Conqueror_g9_d891c2",
  author: "claude",
  version: 1,
  description: "Parent g8_c3d8b0 + hemisphere-weighted Pass 1 grafted from the cousins that beat it.",
  summary: `Parent Conqueror_g8_c3d8b0 lost season #121 to four
cousins (g6_53407c, g8_3280dd, g9_469924, g9_5c4555). The recurring
behavioral edge those winners share - and which the parent does
NOT have - is hemisphere-weighted Pass 1 adjacent kill scoring:

  score = enemy + 0.4 * sum(enemy mass in that cardinal's
                            stencil5 hemisphere)

The parent's adjacent decision currently goes through a
hasAdjacentTarget short-circuit to Conqueror.act, which scores
purely by raw enemy strength. When two adjacent enemies are
comparable, that picks the thinnest facade; the winners pick the
side with more enemy mass behind it - the wall worth puncturing.

This descendant grafts that Pass 1 onto the parent. The
hasAdjacentTarget block is replaced with explicit hemisphere-
weighted Pass 1 (kill) plus a Pass 2 fallback to Conqueror.act for
non-kill adjacent actions (grabs, partial-fill friendlies). The 5x5
stencil routing (Pass 3) and the no-margin kill (Pass 4) are
byte-identical to the parent.

Tech is preserved at the parent's distinctive
{move:85, stack:0, prod:2, atk:9, def:4}. atk=9 was chosen to widen
the Pass 4 kill window, and that reasoning still applies; it also
amplifies the new Pass 1 once it picks the wall to punch.

The smallest reviewable step: only the adjacent-decision block
changes. If hemisphere-weighted Pass 1 was the missing piece, the
season will say so.`,
  tech: { move: 85, stack: 0, prod: 2, atk: 9, def: 4 },
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

    // Pass 1 (NEW vs parent): hemisphere-weighted adjacent kill.
    // Replaces the parent's hasAdjacentTarget -> Conqueror.act
    // short-circuit for the *kill* case only. Non-kill adjacent
    // actions still fall through to Conqueror.act below.
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
        const needed = enemy / BONUS + 0.6;
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

    // Pass 2 (matches parent's intent): non-kill adjacent action ->
    // Conqueror.act. Same delegation the parent used, just gated on
    // the explicit hasOtherTarget signal computed during Pass 1.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3 (parent, unchanged): 5x5 stencil routing for full
    // stalemates. Preserved verbatim including the parent's note
    // that this path is mostly a structural no-op safety net.
    if (!stencil) {
      tryNoMarginKill(army, neighbors, sLimit, pid);
      return;
    }
    const maxEnemy = (sLimit - 0.6) * BONUS;
    if (maxEnemy <= 0) {
      tryNoMarginKill(army, neighbors, sLimit, pid);
      return;
    }

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
    let bestEnemyStencil = Infinity;
    for (let i = 0; i < 25; i++) {
      const hints = DIR_HINTS[i];
      if (hints[0] < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const tArmies = t.armies;
      let enemy = 0;
      for (let k = 0; k < tArmies.length; k++) {
        const a = tArmies[k];
        if (a.player.id !== pid) enemy += a.strength;
      }
      if (enemy <= 0) continue;
      if (enemy > maxEnemy) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      if (dist < bestDist || (dist === bestDist && enemy < bestEnemyStencil)) {
        bestDist = dist;
        bestEnemyStencil = enemy;
        bestPrim = hints[0];
        bestSec = hints[1];
      }
    }

    if (bestPrim >= 0) {
      const primaryTarget = neighbors[bestPrim];
      if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
      if (bestSec >= 0) {
        const secondaryTarget = neighbors[bestSec];
        if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
      }
    }

    // Pass 4 (parent, unchanged): no-margin kill safety net.
    tryNoMarginKill(army, neighbors, sLimit, pid);
  },
};
