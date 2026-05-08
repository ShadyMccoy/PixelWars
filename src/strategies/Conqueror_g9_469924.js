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

// Pass 4 from Conqueror_g8_912a4c (the bot that beat the parent in
// season #120, seed=24, finishing 1st while the parent finished 6th).
// tryCommit refuses any neighbor enemy where enemy/BONUS + 0.6 > sLimit
// (~0.84 effective comfort margin). The engine-strict kill condition
// is sLimit * BONUS * atkMult > enemy * defMult. Between those two
// thresholds sits a ~0.6 raw window of the WEAKEST "too strong"
// neighbors: a full-sLimit attack does kill them. Mutual destruction
// at the upper edge is still a net favorable raw trade. Mixed-owner
// tiles are skipped to keep the reasoning local. Multi-enemy tiles
// use the strongest defender's defMult as a conservative bound.
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

// Hypothesis: parent g8_3280dd lost season #120 (seed=24) to
// Conqueror_g8_912a4c, finishing 6/6. The single concrete behavioral
// edge g8_912a4c has over the parent is a Pass 4 "no-margin kill"
// safety net. The parent's Pass 3 (multi-candidate iteration with
// honest path-clear semantics) is already strong, but when every
// stencil candidate's prim/sec routes are blocked AND no Pass 1/2
// action fires, the parent simply returns. tryCommit's +0.6 raw
// margin (~0.84 effective) is a *comfort* buffer, not the strict
// engine threshold (sLimit*BONUS*atkMult > enemy*defMult). Between
// those is a ~0.6 raw window of the weakest "too strong" neighbors
// where a full-sLimit attack still kills. The thin survivor flips
// the tile, breaking the standoff that the parent idles through.
//
// This is the *smallest* possible step toward 912a4c: it adds Pass 4
// without touching Passes 1, 2, or 3. Tech is unchanged - the shared
// optimum across the winning Conqueror cousin lineage. If Pass 4
// alone closes the season-#120 gap, we'll see it in head-to-head;
// if it doesn't, we still have Pass 3 structure (912a4c's two-axis
// clear vs parent's primary-only) as a separate dimension to explore.
export default {
  name: "Conqueror_g9_469924",
  author: "claude",
  version: 1,
  description: "Parent g8_3280dd + g8_912a4c's no-margin kill Pass 4.",
  summary: `Parent Conqueror_g8_3280dd lost season #120 (seed=24) to
Conqueror_g8_912a4c, finishing last. The concrete behavioral edge
the winner has over the parent is a Pass 4 "no-margin kill" safety
net. Otherwise both bots share Pass 1's hemisphere-weighted scoring
and very similar Pass 3 stalemate handling.

This descendant adds *only* that Pass 4 to the parent. Pass 1, Pass
2, and Pass 3 remain byte-identical to the parent. Tech is unchanged
at the lineage anchor.

Pass 4 fires only when Pass 3 has no committable candidate. It
trades the full sLimit forward power against the weakest non-mixed
neighbor enemy that fails tryCommit's comfort margin but still falls
under the engine-strict kill threshold (sLimit*BONUS*atkMult >
enemy*defMult). Mixed-owner tiles are skipped; multi-enemy tiles
use the strongest defender's defMult as a conservative bound.

This is the smallest reviewable step toward the bot that beat the
parent. If Pass 4 alone closes the gap, the season will say so.`,
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

    // Pass 1 (parent, unchanged): hemisphere-weighted adjacent kill.
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

    // Pass 2 (parent, unchanged): defer to Conqueror.act.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3 (parent, unchanged): multi-candidate iteration over
    // the 5x5 stencil, honest path-clear semantics.
    if (!stencil) {
      // CHANGE vs parent: instead of returning, try Pass 4.
      tryNoMarginKill(army, neighbors, sLimit, pid);
      return;
    }

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
        v = (enemy / BONUS + 0.6 <= sLimit) ? 1 : 0;
      } else if (friendlyArmy) {
        v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
      } else {
        v = 1;
      }
      passCache[dir] = v;
      return v;
    };

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
      candidates.push({ prim: hints[0], sec: hints[1], dist, enemy });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (a.dist !== b.dist) return a.dist - b.dist;
        const ca = isPassable(a.prim);
        const cb = isPassable(b.prim);
        if (ca !== cb) return cb - ca;
        return a.enemy - b.enemy;
      });

      for (let c = 0; c < candidates.length; c++) {
        const cand = candidates[c];
        const primaryTarget = neighbors[cand.prim];
        if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
        if (cand.sec < 0) continue;
        const secondaryTarget = neighbors[cand.sec];
        if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
      }
    }

    // Pass 4 (NEW vs parent, taken from g8_912a4c): no-margin kill
    // when Pass 3 exhausts. Breaks standoffs the parent would idle
    // through.
    tryNoMarginKill(army, neighbors, sLimit, pid);
  },
};
