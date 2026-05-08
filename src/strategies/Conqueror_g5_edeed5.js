import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent g4_be92c1's documented edge: kill margin tightened to 0.45
// (the lever from g8_1c5660 / g6_b70bfa). Keep it.
const BUFFER = 0.45;
const RETAKE_W = 0.8;
const FRIENDLY_W = 0.4;
const RETAKE_VETO = 1.8;

// Stencil5 cell -> [primary dir, secondary dir]. Primary is the
// dominant-axis step (W=0, E=1, N=2, S=3); secondary is the off-axis
// step (or -1 if the cell sits exactly on one axis). Lifted from
// Conqueror_g7_d17330 — the walk-all-candidates fallback that beat
// the parent in season #98 seed=1 needs both axes per candidate.
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

// tryCommit uses the same BUFFER=0.45 as Pass 1 — Pass 3 commits in
// the same expanded band that Pass 1 commits in.
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
    const needed = enemy / BONUS + BUFFER;
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
  name: "Conqueror_g5_edeed5",
  author: "claude",
  version: 1,
  description: "Parent g4_be92c1 with walk-all-candidates Pass 3 fallback (primary+secondary axis) lifted from cousin g7_d17330.",
  summary: `Parent Conqueror_g4_be92c1 lost season #98 in three games:
seed=7 (#6 of 6, 593 ticks), seed=3 (#3 of 6, 689 ticks), seed=1
(#5 of 6, 443 ticks). Two of the three are long-tick games where
the parent stalled in cleared territory while a cousin pushed
deeper.

The parent has solid Pass 1 (retake-aware kill scoring with
BUFFER=0.45, RETAKE_W=0.8, FRIENDLY_W=0.4, hard veto on backup>=
1.8) and Pass 2 (defer to Conqueror.act for non-kill adjacent
moves). Its Pass 3 is the weak link: a single-direction
stencil5 fallback that picks the weakest beatable enemy and
tiebreaks on distance, then steps in exactly one direction. If
that direction is blocked by a capped friendly or a no-go tile,
the army stalls.

Cousin Conqueror_g7_d17330 (which beat the parent at seed=1) has
the SAME Pass 1 / Pass 2 but a far stronger Pass 3:
walk-all-candidates with primary+secondary axes — collect every
beatable stencil enemy, sort closest-first / weakest-tiebreak,
then walk the list trying primary then secondary tryCommit
until one fires. That's exactly the fix for the long-tick
stall pattern.

This descendant grafts that walk-all-candidates Pass 3 onto the
parent's chassis, preserving the parent's BUFFER=0.45 commit
margin in tryCommit (so Pass 3 commits in the same expanded
band Pass 1 does — that's the parent's documented edge over
its grandparent). Pass 1, Pass 2, and tech are unchanged.

Tech stays at {move:90, stack:0, prod:2, atk:4, def:4}: the
shared optimum across this lineage. The walk-all-candidates
fallback specifically rewards mobile reserves (more candidates
that can convert to a successful step), so the high-move
allocation now compounds with the new fallback instead of
sitting idle during stalls.

This is two cousins' deltas merged into one bot:
  - parent's BUFFER=0.45 kill margin (g8_1c5660, g6_b70bfa lever)
  - g7_d17330's walk-all-candidates Pass 3 (validated by
    g5_fbf131 and recently by the seed=1 win over the parent)
Both deltas are independently proven; they should compose.`,
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

    // Pass 1: parent's retake-aware kill scoring (unchanged).
    let bestKill = null;
    let bestScore = -Infinity;
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
      if (enemy <= 0) {
        if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
          hasOtherTarget = true;
        }
        continue;
      }
      const needed = enemy / BONUS + BUFFER;
      if (needed > sLimit) continue;

      let backup = 0;
      let friend = 0;
      const tn = t.neighbors;
      for (let j = 0; j < 4; j++) {
        const tt = tn[j];
        if (!tt || tt === tile) continue;
        const ttArmies = tt.armies;
        let tnE = 0;
        let tnF = 0;
        for (let k = 0; k < ttArmies.length; k++) {
          const a = ttArmies[k];
          if (a.player.id === pid) tnF += a.strength;
          else tnE += a.strength;
        }
        if (tnE > backup) backup = tnE;
        if (tnF > friend) friend = tnF;
      }

      if (backup >= RETAKE_VETO) continue;

      const score = enemy - RETAKE_W * backup + FRIENDLY_W * friend;
      if (score > bestScore) {
        bestScore = score;
        bestKill = t;
        bestNeeded = needed;
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
    let hasAnyAdjacentEnemy = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      for (let k = 0; k < armies.length; k++) {
        if (armies[k].player.id !== pid) { hasAnyAdjacentEnemy = true; break; }
      }
      if (hasAnyAdjacentEnemy) break;
    }
    if (hasAnyAdjacentEnemy) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. Walk-all-candidates 5x5 fallback —
    // collect every beatable stencil enemy, sort closest-first /
    // weakest-tiebreak, walk them trying primary then secondary
    // tryCommit until one fires. Replaces the parent's
    // single-direction stencil step that stalled when the only
    // direction was blocked by a capped friendly.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    // Reachability: tryCommit uses needed = enemy/BONUS + BUFFER, so
    // enemy/BONUS <= sLimit - BUFFER is the actually-reachable bound.
    // Match it here so unreachable targets don't crowd reachable ones
    // (the eligibility bug g4_3fd4ce called out).
    const reachableBound = sLimit - BUFFER;

    const candidates = [];
    for (let i = 0; i < 25; i++) {
      const hints = DIR_HINTS[i];
      if (hints[0] < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const enemy = -sumStrength(t.armies, viewer);
      if (enemy <= 0) continue;
      if (enemy / BONUS > reachableBound) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs(dy - 2);
      candidates.push(dist, enemy, hints[0], hints[1]);
    }
    if (candidates.length === 0) return;

    // Bubble-sort flat tuples (n is small, avoids closure allocation).
    const n = candidates.length / 4;
    for (let a = 0; a < n - 1; a++) {
      for (let b = 0; b < n - 1 - a; b++) {
        const ai = b * 4;
        const bi = ai + 4;
        const ad = candidates[ai];
        const bd = candidates[bi];
        const swap = ad > bd || (ad === bd && candidates[ai + 1] > candidates[bi + 1]);
        if (swap) {
          for (let s = 0; s < 4; s++) {
            const tmp = candidates[ai + s];
            candidates[ai + s] = candidates[bi + s];
            candidates[bi + s] = tmp;
          }
        }
      }
    }

    for (let c = 0; c < n; c++) {
      const ci = c * 4;
      const prim = candidates[ci + 2];
      const sec = candidates[ci + 3];
      const primaryTarget = neighbors[prim];
      if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
      if (sec < 0) continue;
      const secondaryTarget = neighbors[sec];
      if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
    }
  },
};
