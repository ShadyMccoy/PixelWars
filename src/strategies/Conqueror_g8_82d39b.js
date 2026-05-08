import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const BACKING_WEIGHT = 0.4;

// Per cardinal (W=0, E=1, N=2, S=3) the strict-hemisphere stencil5
// indices, excluding the orthogonal axis so the four hemispheres
// don't double-count cells directly beside us.
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

// Parent Conqueror_g7_98d20f's recent losses (season #100) were both
// to siblings carrying hemisphere-weighted Pass 1 scoring -
// Conqueror_g7_efa4e0 (loss #1 winner) and Conqueror_g8_2c6b71
// (loss #2 winner) both prefer the adjacent enemy whose hemisphere
// hides the most enemy mass, not just the locally-strongest one.
// The parent kept the original "max strength" Pass 1 from g6 and
// invested its delta entirely in Pass 3 (honest path-clear cutoff +
// multi-candidate iteration). Pass 3 only fires when Pass 1 and
// Pass 2 both produce nothing, so a weaker Pass 1 means we let
// matches diverge before Pass 3 ever gets a vote. The two bots
// that beat us are direct evidence the hemisphere score earns rating
// in head-to-head.
//
// This descendant grafts the hemisphere-weighted Pass 1 (score =
// enemy + 0.4 * hemisphere_enemy_mass) onto the parent unchanged.
// Adjacent value still dominates (1.0 vs 0.4 spread over up to 10
// stencil cells), so for genuinely uneven matchups Pass 1 still
// punches the strongest enemy; ties and near-ties go to the side
// with more structural depth - the wall worth puncturing first
// instead of the thinnest facade.
//
// The parent's Pass 3 (honest sLimit-based isPassable + multi-
// candidate iteration with primary->secondary fallback per
// candidate) is left strictly intact. That is the parent's unique
// edge over both winning siblings, who still use single-candidate
// Pass 3, and there's no reason to give it back.
//
// Tech is also unchanged: {move:90, stack:0, prod:2, atk:4, def:4}
// is the shared optimum across this entire winning Conqueror
// cousin lineage, and the loss signal points at target selection,
// not allocation.
export default {
  name: "Conqueror_g8_82d39b",
  author: "claude",
  version: 1,
  description: "Conqueror_g7_98d20f + hemisphere-weighted Pass 1 from the siblings that beat it.",
  summary: `Parent Conqueror_g7_98d20f lost season #100 twice, both
times to siblings carrying hemisphere-weighted Pass 1 scoring
(Conqueror_g7_efa4e0 and Conqueror_g8_2c6b71). The parent kept the
original max-strength Pass 1 from g6 and invested its delta
entirely in Pass 3 (honest path-clear cutoff plus multi-candidate
iteration). Pass 3 only runs after Pass 1 and Pass 2 both yield
nothing, so a weaker Pass 1 lets matches diverge before Pass 3 ever
gets a vote.

This descendant grafts the hemisphere-weighted Pass 1 from the two
winning siblings onto the parent: among beatable adjacent enemies,
score by enemy + 0.4 * (sum of enemy strength in that direction's
strict hemisphere of the 5x5 stencil). Adjacent value still
dominates (1.0 vs 0.4 spread over up to 10 cells), so unbalanced
match-ups still kill the strongest local target; ties and near-ties
prefer the side with more structural depth - the wall worth
puncturing - over the thinnest facade.

Pass 2 (Conqueror.act fallback) and Pass 3 (the parent's honest
path-clear cache plus multi-candidate primary->secondary iteration)
are left strictly intact. The parent's Pass 3 is its unique edge
over both winning siblings, which still use single-candidate Pass 3,
and there's no reason to surrender it.

Tech unchanged at {move:90, stack:0, prod:2, atk:4, def:4} - the
shared optimum across this lineage; the loss signal is about kill
priority, not allocation.`,
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
    // threat score. Adjacent (1.0) still outweighs the spread
    // hemisphere term (0.4 over up to 10 cells); ties resolve toward
    // the side with more enemy structural mass.
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

    // Pass 3: full stalemate. Unchanged from parent g7_98d20f -
    // honest path-clear cutoff matched to tryCommit, multi-candidate
    // iteration with primary->secondary fallback per candidate.
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
