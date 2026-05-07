import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.4;

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

// Parent Conqueror_g8_a9c587 lost 3 of its season-#54 matches with
// the same {move:90, stack:0, prod:2, atk:4, def:4} tech. The loss
// pattern that matters most:
//
//   seed=20  finished #6 of 6, winner = Conqueror_g3_4a7a4a
//   seed=22  finished #5 of 6, winner = Conqueror_g6_936d2f
//   seed=14  finished #5 of 6, winner = Conqueror_g2_6b59e8
//
// Two of those three winners (g6_936d2f and g2_6b59e8) run the
// SAME tech as the parent — 90/0/2/4/4 — so tech alone cannot
// explain those losses. They beat the parent on kernel choices
// (weakness-first stalemate routing, hemisphere-weighted picker).
//
// The third winner — Conqueror_g3_4a7a4a — is the damning one. It
// put the parent dead last (#6 of 6) using the simplest kernel of
// the three (pure Conqueror.act fallthrough + a strongest-beatable
// Pass 1) but a markedly more balanced tech:
//   {move:75, stack:0, prod:2, atk:13, def:10}.
// g3_4a7a4a's design note specifically calls this out: "atk/def
// staying sub-baseline as the residual cost of the move-heavy
// build" was its parent's flaw, and reclaiming a chunk of atk/def
// at a small garrison cost is what made it win.
//
// The parent runs atk=4 and def=4 — both deep below the
// neutral-20 baseline anchor (multiplier strictly < 1.0× per
// docs/techs.md). Every adjacent kill exchange is paying that
// penalty on both sides of the equation: weaker outgoing punch,
// weaker garrison resistance to the inevitable counterattack.
// On a small wrap map (lab1, 24x18) with maxArmy 6, fights
// resolve in a handful of ticks, so a sub-baseline atk/def
// multiplier compounds quickly into territorial losses.
//
// THE CHANGE in this descendant is exactly one line: adopt
// g3_4a7a4a's tech allocation verbatim. Kernel logic
// (Pass 1 strongest-beatable kill, Pass 2 Conqueror.act
// fallthrough, Pass 3 two-axis path-clear 5x5 stencil) is
// preserved BYTE-FOR-BYTE from the parent. The parent's
// stalemate routing is its main differentiator from the simpler
// winners and worth keeping; the bet is that pairing it with
// g3_4a7a4a's better-balanced tech will outperform either
// component alone.
//
// Why not also touch MARGIN, the Pass 3 sort, or BACKING_WEIGHT?
// Two of three winners (g6, g2) shared the parent's tech, so the
// parent's kernel must already be losing to them on logic. But
// changing both kernel and tech in one descendant makes the
// signal unrecoverable — if g9 wins, we can't tell whether the
// tech rebalance or the kernel tweak carried the match. Keeping
// this change isolated to tech means the next descendant has
// clean ground to test a kernel change against.
export default {
  name: "Conqueror_g9_f7d113",
  author: "claude",
  version: 1,
  description: "Conqueror_g8_a9c587 kernel verbatim with Conqueror_g3_4a7a4a's balanced tech (75/0/2/13/10).",
  summary: `Parent Conqueror_g8_a9c587 lost 3 season-#54 matches.
Two winners (Conqueror_g6_936d2f, Conqueror_g2_6b59e8) ran the
same 90/0/2/4/4 tech as the parent and beat it on kernel logic.
The third winner (Conqueror_g3_4a7a4a) put the parent dead last
(#6 of 6) at seed=20 using the simpler pure-Conqueror kernel but
a much more balanced tech: 75/0/2/13/10.

g3_4a7a4a's design note explicitly identifies the parent's
sub-baseline atk=4 / def=4 as "residual cost of the move-heavy
build" and reclaims atk/def toward the neutral-20 anchor at a
small garrison cost. On lab1 (24x18 wrap, maxArmy 6) fights
resolve fast, so a sub-baseline atk/def multiplier compounds
quickly into territorial loss.

This descendant is a pure tech-only change: kernel byte-for-byte
identical to the parent (Pass 1 strongest-beatable kill, Pass 2
Conqueror.act fallthrough, Pass 3 two-axis path-clear 5x5
stencil), tech adopts g3_4a7a4a's 75/0/2/13/10. Garrison floor
moves from 0.6 (move 90) to 0.75 (move 75) — still a large edge
over the 1.3 neutral. atk goes 4 -> 13, def 4 -> 10, both still
below the 20-anchor but close enough that the per-fight penalty
shrinks substantially.

Single-knob discipline: the kernel stays put so a future
descendant can A/B kernel tweaks against this baseline without
the tech axis confounding the signal.`,
  tech: { move: 75, stack: 0, prod: 2, atk: 13, def: 10 },
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

    // Pass 1: strongest beatable adjacent enemy (no reach weighting).
    let bestKill = null;
    let bestEnemy = -1;
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
        if (enemy > bestEnemy) {
          bestEnemy = enemy;
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
