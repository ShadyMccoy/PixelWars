import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Tightened from parent's 0.6 to 0.45. This is the one-knob change
// from Conqueror_g9_192ea5, which beat the parent in season #112
// seed=17. The parent kept its Pass 1 hemisphere-backing + territory
// bias scoring while still inheriting the loose 0.6 margin from the
// trunk. With BONUS 1.4 and typical enemy stacks of 1.0..3.5 on lab1,
// the 0.6 slack skips every kill where attackPower lands in the band
//   [enemy/1.4 + 0.45, enemy/1.4 + 0.6)
// Tightening to 0.45 converts those stalls into kills without
// changing target selection at all - the territory bias and
// hemisphere backing still pick the same tile, we just commit on it
// in more cases. 0.45 still absorbs sub-0.1 float jitter and a small
// mid-tick reinforcement.
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const TERRITORY_BIAS = 0.3;

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

// Hypothesis: parent Conqueror_g8_bfcb0e lost season #112 to several
// rivals, including Conqueror_g9_192ea5 (winner of seed=17). g9_192ea5
// is the smallest validated cousin step from the same lineage trunk:
// MARGIN tightened from 0.6 to 0.45, applied consistently across
// tryCommit, Pass 1 eligibility, and the Pass 3 reachability bound.
//
// The parent already carries the territory-bias lever (g9_01de66's
// idea: +0.3 per friendly neighbor of the kill target). That lever
// improves WHICH tile gets picked when multiple kills are available.
// What it doesn't fix is the broader Conqueror trunk's tendency to
// SKIP marginal kills entirely - the 0.6 margin band wastes whole
// engagement opportunities even when the territory bias has already
// flagged a worthwhile target.
//
// The two levers are orthogonal:
//   - TERRITORY bias (parent's lever): picks consolidating kills
//     over diluting ones. Operates on target selection.
//   - MARGIN tightening (this descendant): converts stalls into
//     kills inside the [enemy/1.4 + 0.45, enemy/1.4 + 0.6) band.
//     Operates on commit threshold.
//
// They compose by addition - the territory bias still picks the same
// tile (since both candidates pass the lower threshold or both fail
// it together when scores are close), but more of those picks
// actually fire. Each successful kill in the new margin band leaves
// 0.15 more strength behind on the home tile, which is exactly the
// compounding benefit Conqueror was built to chase.
//
// Risks: 0.45 leaves less slack for mid-tick reinforcement; a
// coordinated 0.6+ pile-on between scoring and resolution could flip
// a kill. On lab1 (30x22 wrap, growth 1.8) that's rare. The Pass 3
// reachability bound moves from sLimit + 0.5 (parent's mistake -
// it allowed reaching enemies it couldn't actually beat) to
// sLimit - MARGIN, which matches the actual kill threshold and is
// strictly safer.
//
// Tech unchanged at the GA-optimum {move:90, stack:0, prod:2, atk:4,
// def:4} - move-heavy economy lets the new kills compound faster.
export default {
  name: "Conqueror_g9_b68f52",
  author: "claude",
  version: 1,
  description: "Conqueror_g8_bfcb0e with MARGIN tightened 0.6 -> 0.45, matching Conqueror_g9_192ea5 which beat the parent in season #112.",
  summary: `Parent Conqueror_g8_bfcb0e lost season #112 multiple times,
notably to Conqueror_g9_192ea5 (winner of seed=17). g9_192ea5's only
behavioral edge over the trunk is MARGIN=0.45 instead of 0.6 - the
proven one-knob lever that aligns commit threshold with the actual
1.4 BONUS kill math. The parent inherited the loose 0.6 unchanged
when it added the territory-bias lever from g9_01de66.

The two levers are orthogonal:
  - TERRITORY bias picks WHICH tile to attack (consolidates).
  - MARGIN tightening converts marginal stalls into kills.

Both stack: the bias still picks the same tile, but more of those
picks actually commit. Each kill in the [enemy/1.4 + 0.45,
enemy/1.4 + 0.6) band that the parent skipped now lands, leaving
0.15 more strength on the home tile per kill (compounding benefit
the Conqueror lineage was designed for).

Applied consistently in three spots:
  - tryCommit (was hardcoded 0.6)
  - Pass 1 eligibility (was MARGIN 0.6)
  - Pass 3 reachability bound (was sLimit + 0.5; now sLimit - MARGIN,
    matching the actual kill threshold - strictly safer)

Pass 1 territory + hemisphere scoring unchanged. Pass 2 still
defers to Conqueror.act. Tech unchanged at {move:90, stack:0,
prod:2, atk:4, def:4}, the GA-optimum across the lineage.

Risks: less slack for mid-tick reinforcement; a 0.6+ pile-on between
scoring and resolution could flip a kill. Rare on a wrap map this
size. If lift confirms, future descendants can tune territory bias
or hemisphere weight; if not, the gap to g9_192ea5 was elsewhere
and we'll know that next iteration.`,
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
    // threat score + territory bias. MARGIN tightened to 0.45.
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

        let friendlyNbrs = 0;
        const tn = t.neighbors;
        for (let n = 0; n < 4; n++) {
          const nt = tn[n];
          if (nt && nt.ownerId === pid) friendlyNbrs++;
        }

        const score = enemy + BACKING_WEIGHT * backing + TERRITORY_BIAS * friendlyNbrs;
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
    // tiebreak, weakness as final tiebreak. Reachability bound now
    // uses sLimit - MARGIN instead of the parent's sLimit + 0.5,
    // matching the actual kill threshold.
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
        v = (enemy / BONUS <= sLimit - MARGIN) ? 1 : 0;
      } else if (friendlyArmy) {
        v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
      } else {
        v = 1;
      }
      passCache[dir] = v;
      return v;
    };

    const reachableEnemyOverBonus = sLimit - MARGIN;
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
      if (enemy / BONUS > reachableEnemyOverBonus) continue;
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
