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
// four hemispheres do not double-count cells directly beside us.
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

// Parent Conqueror_g7_98d20f's unique win was Pass 3:
//   - honest path-clear semantics (matches tryCommit's exact cutoff)
//   - multi-candidate iteration (try every beatable stencil target,
//     not just the single best, falling through primary->secondary
//     on each)
// That fixed real stalls during stalemates. But the parent kept the
// vanilla "strongest beatable" Pass 1 from g6_aa7266, scoring kills
// by raw enemy strength alone. Both bots that beat the parent in
// season #101 (Conqueror_g7_efa4e0 and Conqueror_g8_2c6b71) share
// hemisphere-weighted Pass 1 scoring:
//
//   score = enemy + BACKING_WEIGHT * sum(enemy mass in that
//                                        cardinal's stencil5 hemisphere)
//
// This biases the kill toward the side with more structural depth -
// the "wall" hemisphere worth puncturing, rather than the thinnest
// facade. Adjacent strength still dominates (1.0 vs 0.4 spread over
// up to 10 cells), so when one adjacent enemy is clearly the bigger
// threat we still take it; the score only swings target choice when
// the adjacent enemies are comparable. The parent's direct losses to
// efa4e0 and 2c6b71 are evidence this scoring pays off in head-to-head.
//
// Pass 1, Pass 2, and Pass 3 of the parent are otherwise unchanged:
//   * Pass 1 still uses needed = enemy/BONUS + 0.6 as the beatability
//     gate, still tracks hasOtherTarget so Pass 2 fires correctly.
//   * Pass 2 still defers to Conqueror.act for non-kill adjacency.
//   * Pass 3 keeps the parent's multi-candidate iteration with the
//     honest path-clear cutoff. (Switching to the 4-level path-clear
//     from g8_2c6b71 was the alternative; we keep the parent's
//     iteration instead because iteration is strictly more general -
//     it falls through to siblings even when the top pick's secondary
//     is also blocked, which the 4-level metric still single-shots.)
//
// Tech is unchanged: {move:90, stack:0, prod:2, atk:4, def:4} is the
// shared optimum across this entire winning Conqueror cousin lineage.
// The only behavioral change vs the parent is hemisphere-weighted
// scoring in Pass 1; Pass 3 remains the parent's iteration kernel.
export default {
  name: "Conqueror_g8_3280dd",
  author: "claude",
  version: 1,
  description: "Parent g7_98d20f's multi-candidate Pass 3 + the hemisphere-weighted Pass 1 from the siblings that beat it.",
  summary: `Parent Conqueror_g7_98d20f's unique improvement was
Pass 3: honest path-clear semantics plus multi-candidate iteration
(try every beatable stencil target, not just the top one). It kept
g6's vanilla "strongest beatable" adjacent kill in Pass 1, scoring
purely by raw enemy strength.

Both bots that beat the parent in season #101 - Conqueror_g7_efa4e0
and Conqueror_g8_2c6b71 - share a different Pass 1: hemisphere-
weighted scoring,

  score = enemy + 0.4 * sum(enemy mass in that cardinal's
                            stencil5 hemisphere)

biasing the kill toward the side with more structural depth (the
"wall" worth puncturing) instead of the thinnest facade. Adjacent
strength still dominates (1.0 vs 0.4 spread over up to 10 cells),
so the score only swings target choice when adjacent threats are
comparable; otherwise it agrees with the parent.

This descendant fuses the two:
  Pass 1: hemisphere-weighted scoring (from the winners).
  Pass 2: unchanged - Conqueror.act for non-kill adjacency.
  Pass 3: unchanged - parent's honest path-clear + multi-candidate
          iteration. (Strictly more general than g8_2c6b71's 4-level
          single-pick: iteration falls through to siblings when both
          axes of the top pick are unworkable.)

Tech unchanged: the shared optimum across the winning Conqueror
cousin lineage. The diff vs the parent is scoped to Pass 1 target
scoring, the smallest change that addresses the loss context.`,
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

    // Pass 1: best beatable adjacent enemy by hemisphere-weighted
    // score. Track hasOtherTarget for Pass 2 fallback.
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

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 with multi-candidate iteration.
    // Unchanged from parent g7_98d20f.
    if (!stencil) return;

    // Cardinal passability cache. v=1 means a tryCommit on this
    // neighbor would succeed *this tick*; v=0 means it would
    // refuse. The enemy threshold matches tryCommit's exact cutoff
    // (enemy / BONUS + 0.6 <= sLimit).
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

    // Collect every beatable stencil enemy as a candidate. Lenient
    // sLimit + 0.5 cutoff because the stencil target is up to 2
    // hops away and growth/intervening combat may close the gap.
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
    if (candidates.length === 0) return;

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
  },
};
