import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

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

function enemyExposure(target, pid) {
  const ns = target.neighbors;
  let count = 0;
  for (let i = 0; i < 4; i++) {
    const n = ns[i];
    if (!n) continue;
    const oid = n.ownerId;
    if (oid !== 0 && oid !== pid) count++;
  }
  return count;
}

// Parent Conqueror_g6_8fe9fc lost season #16 to a tight cluster
// dominated by tech-rebalanced kin: Conqueror_g2_5908df
// (move:80,prod:2,atk:10,def:8) and Conqueror_g4_b6afb7
// (move:80,prod:2,atk:14,def:4), plus two losses to
// Membrane_g2_86704b (same move-90 tech but weakest-overkill
// kills) and one max-ticks loss to Membrane_g1_b9f1d5. The
// algorithmic story of the parent is already tight: priority kill
// with exposure tiebreak (Pass 1), Conqueror.act deferral (Pass 2),
// closest-first 5x5 with weakest-tiebreak (Pass 3). The two
// Conqueror winners that beat the parent both kept Conqueror-class
// behavior and won on tech — specifically by trading 10 points of
// move for atk. g4_b6afb7's published thesis is exactly the
// "near-parity seam" failure mode where the parent's strongest
// beatable enemy is just heavy enough that needed > sLimit by a
// sliver and both sides regrow in lockstep — a higher atk
// multiplier breaks that seam without waiting on prod. The
// max-ticks loss to Membrane_g1_b9f1d5 is the same symptom on a
// different map: per-fight edge spent away.
//
// This descendant keeps the parent's full three-pass kernel
// byte-identical and only swaps tech from {move:90, stack:0,
// prod:2, atk:4, def:4} to {move:80, stack:0, prod:2, atk:14,
// def:4} — the same vector that g4_b6afb7 used to beat the parent.
// Garrison floor moves 0.6 -> 0.7 (still extremely aggressive at
// move:80; 5+ strength still pushes forward at full army), and
// the 10 points reinvested into atk lift the attacker multiplier
// on every fight. This both closes the seam-deadlock failure mode
// the Conqueror winners exploited and narrows the per-fight gap
// against the Membrane_g2 weakest-overkill policy that took two
// of the parent's five losses. Behavior is unchanged; only the
// per-fight math shifts.
export default {
  name: "Conqueror_g7_6b2e1a",
  author: "claude",
  version: 1,
  description: "Conqueror_g6_8fe9fc kernel + g4_b6afb7's atk-heavy tech rebalance.",
  summary: `Parent g6_8fe9fc lost #16 to two tech-rebalanced
Conqueror kin (g2_5908df and g4_b6afb7, both move:80 with extra
atk/def) plus Membrane_g2_86704b twice and a max-ticks Membrane_g1
loss. Parent's algorithm is already tight — priority kill with
enemy-exposure tiebreak, Conqueror.act deferral, closest-first 5x5
with weakest-tiebreak. The Conqueror winners beat it on tech, not
behavior; g4_b6afb7's thesis is the near-parity seam where
needed = enemy/BONUS + 0.6 just exceeds sLimit and both sides
regrow in lockstep, broken by a higher atk multiplier rather than
waiting on prod ticks.

Keep parent's full three-pass kernel byte-identical. Only swap tech
to {move:80, stack:0, prod:2, atk:14, def:4} — the exact vector
g4_b6afb7 used to beat the parent. Garrison 0.6 -> 0.7 is rounding
noise vs typical strengths (move:80 is still very aggressive), and
10 points reinvested into atk lift the per-fight multiplier on
every contested attack. This addresses both Conqueror-class seam
deadlocks and the per-fight gap against Membrane_g2's
weakest-overkill policy.`,
  tech: { move: 80, stack: 0, prod: 2, atk: 14, def: 4 },
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

    // Pass 1: strongest beatable adjacent enemy, with enemy-exposure
    // tiebreak when strengths are within 0.3 of each other.
    let bestKill = null;
    let bestEnemy = -1;
    let bestNeeded = 0;
    let bestExposure = -1;
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
        let take = false;
        if (enemy > bestEnemy + 0.3) {
          take = true;
        } else if (enemy >= bestEnemy - 0.3) {
          const exp = enemyExposure(t, pid);
          if (exp > bestExposure || (exp === bestExposure && enemy > bestEnemy)) {
            take = true;
            bestExposure = exp;
          }
        }
        if (take) {
          bestEnemy = enemy;
          bestNeeded = needed;
          bestKill = t;
          if (bestExposure < 0) bestExposure = enemyExposure(t, pid);
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

    // Pass 3: full stalemate. 5x5 with closest-first selection
    // and primary/secondary axis fallback.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    let bestPrim = -1;
    let bestSec = -1;
    let bestDist = Infinity;
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
      if (dist < bestDist || (dist === bestDist && enemy < bestWeak)) {
        bestDist = dist;
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
