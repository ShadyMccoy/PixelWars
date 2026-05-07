import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.4;
const TERRITORY_BIAS = 0.3;

// Stencil5 cell -> [primary dir, secondary dir]. W=0, E=1, N=2, S=3.
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

// Parent g9_c81d7f lost season #77 seed 203 (#6 of 6) to Conqueror_g8_174911,
// and finished #3 of 6 on seed 134 (Conqueror_g6_15ea9a won). g8_174911's
// distinguishing piece versus g9 is a *counter-attack defensive guard*:
// before committing the chosen kill, it estimates the strongest counter
// from a non-target cardinal as ~(maxOther - 1) * BONUS effective
// strength, and aborts the kill if our post-attack remainder can't
// survive it. g9 has no such guard — Pass 1 commits greedily on
// territory-bias score and pyrrhic kills against multi-front pressure
// (exactly the failure mode g8 punishes) just go through.
//
// This descendant ports that single change into g9's three-pass
// structure. Pass 1 keeps the g5_930cc7 territory-bias scoring
// (enemy + 0.3 * friendlyNbrs), but now records per-direction enemy
// strength during the scan and runs the counter-attack guard before
// committing. If the guard trips, we fall through to Pass 2
// (Conqueror.act), which can pick a different cell, hold, or
// rebalance — strictly better than committing a Pyrrhic trade.
//
// Pass 2 (Conqueror.act on any other adjacent action) and Pass 3 (5x5
// stencil with distance-first / two-axis path-clear / weakness-last)
// are preserved verbatim from the parent so the stalemate-routing
// contribution stays intact. MARGIN=0.4 unchanged. Tech 90/0/2/4/4
// unchanged — the move-heavy GA optimum that makes the saved-strength
// remainder actually exploitable next tick.
//
// Composition logic: g8's guard plus g9's territory-bias scoring are
// orthogonal levers on the same Pass-1 decision. The bias picks
// *which* kill to consider; the guard decides *whether to commit it*.
// Stacking them keeps the wound-collapse selection (g9's contribution)
// while filtering out the multi-front pyrrhic kills (g8's contribution).
export default {
  name: "Conqueror_g10_f5e8bf",
  author: "claude",
  version: 1,
  description: "g9 with g8_174911's counter-attack defensive guard added before Pass 1 kill commit; territory-bias scoring and three-pass structure preserved.",
  summary: `Parent Conqueror_g9_c81d7f lost season #77 seed 203 (#6 of 6)
to Conqueror_g8_174911, and finished #3 of 6 on seed 134 (Conqueror_g6_15ea9a
won). g8_174911 distinguishes itself from g9 by carrying a counter-attack
defensive guard: before committing the selected kill it estimates the
strongest counter from a non-target cardinal as ~(maxOther - 1) * BONUS
and aborts if the post-attack remainder can't survive. g9 has no such
guard — its Pass 1 commits greedily on territory-bias score and the
multi-front pyrrhic trade is precisely the failure mode g8 exploits.

This descendant ports that single change. Pass 1 still scores adjacent
kill candidates by enemy + 0.3*friendlyNbrs (g5_930cc7's territory bias,
g9's contribution), but during the scan it now also records per-direction
enemy strength. Before committing the chosen kill, it computes
(maxOther - 1) * BONUS and aborts if the kill's surplus
(army.strength - bestNeeded) doesn't strictly exceed it. On abort,
control falls through to Pass 2 (Conqueror.act), which may pick a
different cell, hold, or rebalance — strictly better than a Pyrrhic
commit.

Pass 2 (Conqueror.act on any other adjacent action) and Pass 3 (5x5
stencil with distance-first, two-axis path-clear, weakness-last) are
preserved verbatim from the parent so the stalemate-routing contribution
stays intact. MARGIN=0.4 unchanged; the diff is strictly the guard.
Tech 90/0/2/4/4 unchanged — the move-heavy GA optimum across the
Conqueror_g4+ lineage, which is what makes the saved-strength remainder
actually exploitable on the next tick.

g8's guard and g9's territory-bias scoring are orthogonal levers on the
same Pass-1 decision (the bias selects *which* kill, the guard decides
*whether to commit*), so stacking them composes cleanly.`,
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

    // Pass 1: best beatable adjacent enemy by
    //   score = enemy + TERRITORY_BIAS * friendlyNbrs
    // (territory-bias kill priority — imported from g5_930cc7,
    // which beat the g8 ancestor in season #67).
    //
    // Also record per-direction enemy strength so we can run the
    // counter-attack guard from g8_174911 before committing.
    const enemyAt = [0, 0, 0, 0];
    let bestKill = null;
    let bestKillIdx = -1;
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
        enemyAt[i] = enemy;
        const needed = enemy / BONUS + MARGIN;
        if (needed > sLimit) continue;
        let friendlyNbrs = 0;
        const tn = t.neighbors;
        for (let n = 0; n < 4; n++) {
          const nt = tn[n];
          if (nt && nt.ownerId === pid) friendlyNbrs++;
        }
        const score = enemy + TERRITORY_BIAS * friendlyNbrs;
        if (score > bestScore) {
          bestScore = score;
          bestNeeded = needed;
          bestKill = t;
          bestKillIdx = i;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }
    if (bestKill) {
      // Counter-attack guard (from g8_174911): a counter from a
      // non-target cardinal arrives at ~(maxOther - 1) * BONUS
      // effective strength. Skip the commit if our post-attack
      // remainder can't survive that. hasOtherTarget is already
      // true here (we found a kill candidate), so falling through
      // routes us into Pass 2 / Conqueror.act, which may select a
      // different cell or hold.
      const remaining = army.strength - bestNeeded;
      let maxOther = 0;
      for (let i = 0; i < 4; i++) {
        if (i === bestKillIdx) continue;
        const e = enemyAt[i];
        if (e > maxOther) maxOther = e;
      }
      if ((maxOther - 1) * BONUS < remaining) {
        army.attack(bestKill, bestNeeded);
        return;
      }
      // Guard tripped — fall through to Pass 2.
    }

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 stencil with distance-first,
    // two-axis path-clear tiebreak, weakness as final tiebreak.
    if (!tile.stencil5) {
      Conqueror.act(army, game);
      return;
    }
    const stencil = tile.stencil5;
    const viewer = army.player;

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
      const primClear = isPassable(hints[0]);
      const secClear = hints[1] >= 0 ? isPassable(hints[1]) : 0;
      const clear = primClear * 2 + secClear;
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
    if (bestPrim < 0) {
      Conqueror.act(army, game);
      return;
    }

    const primaryTarget = neighbors[bestPrim];
    if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
    if (bestSec < 0) {
      Conqueror.act(army, game);
      return;
    }
    const secondaryTarget = neighbors[bestSec];
    if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
    Conqueror.act(army, game);
  },
};
