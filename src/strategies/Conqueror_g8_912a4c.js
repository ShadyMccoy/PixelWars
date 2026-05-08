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

// Per cardinal direction (W=0, E=1, N=2, S=3) the stencil5 indices
// strictly in that hemisphere - excludes the orthogonal axis so the
// four hemispheres do not double-count the cells directly beside us.
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

// No-margin kill fallback (Conqueror_g7_3f7da6). tryCommit refuses
// any neighbor enemy where `enemy/BONUS + 0.6 > sLimit` (~0.84
// effective comfort margin). The engine-strict kill condition is
// sLimit * BONUS * atkMult > enemy * defMult. Between those two
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

// Parent Conqueror_g7_31769b lost season #82 in two matchups:
//   seed=24 to Conqueror_g8_25adb0
//   seed=19 to Conqueror_g7_3f7da6
// Each cousin already encodes a fix to a real weakness in g7's
// 3-pass kernel, and the two fixes are orthogonal:
//
//   - g8_25adb0 fixes the single-best-pick stall in Pass 3. The
//     parent picks ONE best stencil candidate, tries its primary
//     direction, then its secondary, then bails. tryCommit refuses
//     full friendlies and too-strong enemies, so when the chosen
//     "best" candidate's prim AND sec routes both go through such
//     neighbors, the turn is wasted - even when a slightly farther
//     beatable candidate has a reachable prim/sec pair. g8_25adb0
//     walks every beatable candidate in priority order and commits
//     on the first success. Critically the priority is identical to
//     the parent's, so g7's first pick is still attempted first;
//     the only behavioral change is that prim+sec failure no longer
//     ends the turn.
//
//   - g7_3f7da6 fixes the global stall when even Pass 3 has nothing
//     committable. tryCommit's +0.6 raw margin (~0.84 effective) is
//     a comfort buffer; the engine-strict kill condition is just
//     sLimit * BONUS * atkMult > enemy * defMult, a ~0.6 raw
//     wider window containing the weakest "too strong" neighbors.
//     A full-sLimit attack still kills - thin survivor, but the
//     tile flips and the home garrison stays intact. Idling
//     preserves strength but leaves real captures on the table.
//
// This descendant is the natural triple merge: keep parent's
// hemisphere-weighted Pass 1 (the lever that beat g6 on adjacent
// kill selection), replace Pass 3 with g8_25adb0's walk-all-
// candidates structure (priority unchanged so the same first pick
// is still tried), and append g7_3f7da6's no-margin kill as Pass 4
// when Pass 3 exhausts. Tech is unchanged at the lineage anchor.
export default {
  name: "Conqueror_g8_912a4c",
  author: "claude",
  version: 1,
  description: "Parent g7_31769b + walk-all-candidates Pass 3 (g8_25adb0) + no-margin kill Pass 4 (g7_3f7da6).",
  summary: `Triple merge of the three improvements that have actually
beaten this lineage in head-to-head play.

Parent Conqueror_g7_31769b lost in season #82 to two cousins:
Conqueror_g8_25adb0 (seed=24) and Conqueror_g7_3f7da6 (seed=19).
Each cousin demonstrates a distinct, orthogonal fix.

g8_25adb0 — fixes the single-best-pick stall in Pass 3. When the
parent's chosen stencil candidate has its primary AND secondary
directions both fail tryCommit, g7 ends the turn. g8_25adb0 walks
every beatable stencil candidate in priority order and commits on
the first success. Same priority key as g7's, so the candidate g7
*would have picked* is still attempted first; the only difference
is that prim+sec failure no longer wastes the turn.

g7_3f7da6 — adds a no-margin kill as a final safety net.
tryCommit's +0.6 raw margin (~0.84 effective) is a comfort buffer;
the engine-strict kill threshold is sLimit*BONUS*atkMult >
enemy*defMult. Between those is a ~0.6 raw window of the WEAKEST
"too strong" neighbors. A full-sLimit attack on one of those still
kills the enemy and captures the tile (thin survivor, favorable
raw trade). When fully stalled, this is the difference between
idling forever and breaking through.

Behavior:
  Pass 1 — hemisphere-weighted adjacent kill (parent, unchanged).
           Score = enemy + 0.4 * hemisphere_backing — the bias that
           already beat g6's raw-strength Pass 1 in head-to-head.
  Pass 2 — defer to Conqueror.act for friendly-balance / empty
           grabs (parent, unchanged).
  Pass 3 — walk-all-candidates 5x5 stalemate. Sort key
           (dist asc, clear desc, weakness asc) where
           clear = primClear*2 + secClear (g8_25adb0's two-axis
           clear, finer than g7's single-bit primary check).
           Walk the sorted candidates and commit on first
           tryCommit success.
  Pass 4 — no-margin kill (g7_3f7da6). Only fires when Pass 3 has
           no committable candidate at all. Picks the weakest
           non-mixed neighbor enemy where sLimit beats it under
           the engine-strict threshold; mixed-owner tiles are
           skipped to keep reasoning local; multi-enemy tiles use
           the strongest defender's defMult as a conservative
           bound on the kill ceiling.

Tech is unchanged at {move:90, stack:0, prod:2, atk:4, def:4} —
the anchor every winning Conqueror cousin in this lineage has kept.
The only behavioral differences vs the parent are (a) Pass 3 keeps
trying when its first pick's routes are dead, and (b) when even
that exhausts, Pass 4 takes a strict-threshold kill instead of
idling.`,
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

    // Pass 1 (parent g7_31769b, unchanged): best beatable adjacent
    // enemy by hemisphere-weighted score (enemy + 0.4 * backing).
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

    // Pass 2 (parent, unchanged): defer to Conqueror.act for any
    // other adjacent action (empty grab, friendly balance).
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3 (g8_25adb0-structured): walk-all-candidates 5x5
    // stalemate. Same priority order as the parent's single-pick;
    // the only structural change is that we don't bail when the
    // first pick's prim+sec routes are both dead.
    if (!stencil) {
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
        v = (enemy / BONUS <= sLimit + 0.5) ? 1 : 0;
      } else if (friendlyArmy) {
        v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
      } else {
        v = 1;
      }
      passCache[dir] = v;
      return v;
    };

    // Flat tuple layout (dist, clear, enemy, prim, sec). <=24 entries.
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
      const primClear = isPassable(hints[0]);
      const secClear = hints[1] >= 0 ? isPassable(hints[1]) : 0;
      const clear = primClear * 2 + secClear;
      candidates.push(dist, clear, enemy, hints[0], hints[1]);
    }

    if (candidates.length > 0) {
      const stride = 5;
      const n = candidates.length / stride;
      // Bubble sort: dist asc, clear desc, enemy asc.
      for (let a = 0; a < n - 1; a++) {
        for (let b = 0; b < n - 1 - a; b++) {
          const ai = b * stride;
          const bi = ai + stride;
          const ad = candidates[ai];
          const bd = candidates[bi];
          const ac = candidates[ai + 1];
          const bc = candidates[bi + 1];
          const ae = candidates[ai + 2];
          const be = candidates[bi + 2];
          const swap =
            ad > bd
            || (ad === bd && ac < bc)
            || (ad === bd && ac === bc && ae > be);
          if (swap) {
            for (let s = 0; s < stride; s++) {
              const tmp = candidates[ai + s];
              candidates[ai + s] = candidates[bi + s];
              candidates[bi + s] = tmp;
            }
          }
        }
      }

      for (let c = 0; c < n; c++) {
        const ci = c * stride;
        const prim = candidates[ci + 3];
        const sec = candidates[ci + 4];
        const primaryTarget = neighbors[prim];
        if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
        if (sec < 0) continue;
        const secondaryTarget = neighbors[sec];
        if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
      }
    }

    // Pass 4 (g7_3f7da6's no-margin kill): final safety net for
    // standoffs where Pass 3 found nothing committable. Trades
    // full sLimit forward power for the weakest "too strong"
    // neighbor under the engine-strict kill threshold.
    tryNoMarginKill(army, neighbors, sLimit, pid);
  },
};
