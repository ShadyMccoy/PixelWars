import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent Conqueror_g7_efa4e0 ran MARGIN = 0.6. THREE independent
// winners against this parent's lineage demonstrated that tightening
// this knob is a clean win:
//   - Conqueror_g9_fd075f (beat parent in season #109 seed=30):
//     MARGIN = 0.4
//   - Conqueror_g6_15ea9a (beat parent's ancestor in season #74
//     seed=136, cited by fd075f as motivation): MARGIN = 0.4
//   - Conqueror_g5_b451ab (beat g8_15e6f9 in season #108, cited by
//     g9_a22c1e): MARGIN = 0.45
//
// The thesis from b451ab/fd075f: with minimum-overkill, every 0.15
// left in the margin is strength wasted on every kill. The 0.6
// margin skips fights in the band
//     [enemy/BONUS + 0.45, enemy/BONUS + 0.6)
// that 0.45 turns into wins. 0.45 still beats float jitter and
// absorbs a small mid-tick reinforcement; only a coordinated 0.6+
// pile-on flips the kill, and that's rare on lab1.
//
// Picking 0.45 over 0.4 here is a deliberate hedge: the parent's
// Pass 1 has only the forward-backing score (no exposure or retake
// penalty), so it has less veto-power on pyrrhic captures than the
// g8_15e6f9 line that 0.45 was originally tuned against. 0.45
// keeps slightly more safety margin against retake while still
// reclaiming most of the band parent currently refuses.
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;

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

// tryCommit uses MARGIN (parent hardcoded 0.6). This keeps Pass 3's
// commitment threshold consistent with Pass 1 — otherwise Pass 1
// would approve a target Pass 3 refuses, which is the inconsistency
// fd075f flagged in its parent.
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

export default {
  name: "Conqueror_g8_d001cc",
  author: "claude",
  version: 1,
  description: "Conqueror_g7_efa4e0 with MARGIN tightened from 0.6 to 0.45.",
  summary: `Single-knob tune of Conqueror_g7_efa4e0. Parent runs
MARGIN = 0.6 in its kill-commitment formula
(needed = enemy/BONUS + MARGIN). Three independent winners against
this lineage all tightened this knob and outranked the 0.6 line:

  - Conqueror_g9_fd075f beat parent in season #109 seed=30 with
    MARGIN = 0.4.
  - Conqueror_g6_15ea9a beat parent's ancestor in season #74
    seed=136 with MARGIN = 0.4 (cited as motivation by fd075f).
  - Conqueror_g5_b451ab beat the g8_15e6f9 line in season #108
    with MARGIN = 0.45 (cited by g9_a22c1e).

The math: with minimum-overkill, every 0.15 left in the margin is
strength wasted on every kill. MARGIN = 0.6 also skips fights in
the band [enemy/BONUS + 0.45, enemy/BONUS + 0.6) that 0.45 wins
outright. Post-kill surplus at 0.45 is still 0.45 * 1.4 = 0.63
strength of positive ownership, which beats float jitter and
absorbs small mid-tick reinforcement.

Hedging 0.45 instead of 0.4 because parent's Pass 1 has only the
forward-backing score — no exposure/retake penalty like the
g8_15e6f9 line — so target selection has less veto-power on
pyrrhic captures. 0.45 reclaims most of the refused band while
keeping a hair more safety margin against retake.

Pass 1 (hemisphere-weighted adjacent kill priority), Pass 2
(Conqueror.act fallback), and Pass 3 (5x5 stencil routing with
distance-first, path-clear tiebreak) are unchanged. tryCommit
now references MARGIN (parent hardcoded 0.6) so Pass 3 commits
on the same threshold Pass 1 selects on — otherwise the two
passes would disagree on what's reachable this tick.

Tech unchanged {move:90, stack:0, prod:2, atk:4, def:4} — every
winner cited above shares this tech; the loss is about commitment
margin, not allocation.

Failure mode: a coordinated 0.6+ mid-tick reinforcement retakes
after a tight kill. Mitigation: rare on lab1's 30x22 maxArmy=12
layout, and the parent's hemisphere-backing score already biases
us toward kills with structural depth (i.e. ones likely to stick).`,
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
    // threat score. Track hasOtherTarget for Pass 2 fallback.
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
          bestKill = t;
          bestNeeded = needed;
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

    // Pass 3: full stalemate. 5x5 with distance-first, path-clear
    // tiebreak, weakness as final tiebreak. (Unchanged from parent.)
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
