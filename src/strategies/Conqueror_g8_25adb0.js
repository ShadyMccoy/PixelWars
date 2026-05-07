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

// Parent g7 added two-axis path-clear scoring to the stencil tiebreak,
// which was a real upgrade over g4's distance-first / weakness-only
// ordering. But g7 still picks ONE best candidate, tries its primary
// direction, then its secondary, and gives up if both fail. That's the
// same stall mode that knocked g4 off the top of season #10:
// tryCommit fails when the routed neighbor is a maxed friendly (no
// room) or a too-strong enemy, so when the chosen "best" stencil
// target's prim+sec both route through dead lanes, the army wastes
// the turn — even if a slightly farther beatable enemy has a
// reachable prim/sec pair.
//
// g5_fbf131 (which beat the parent in season #37, seed=1) demonstrated
// the fix: collect EVERY beatable stencil candidate, walk them in
// priority order, and commit on the first tryCommit that succeeds.
// g5_fbf131 used g4's plain (dist, weakness) ordering. This descendant
// keeps g7's smarter ordering — (dist asc, clear desc, weakness asc)
// where clear = primary_passable * 2 + secondary_passable — and applies
// it inside g5_fbf131's walk-all-candidates loop.
//
// So the candidate g7 *would have picked* is still tried first (same
// keys, same comparator). The only behavioral change is that when its
// prim+sec both fail, we don't end the turn — we walk to the next
// candidate. Path-clear ordering means we usually walk only one or two
// deep before something commits; it remains useful precisely because
// stalls happen on candidates with low clear scores.
//
// Pass 1 (strongest beatable adjacent kill) and Pass 2 (defer to
// Conqueror.act for friendly-balance / empty grabs) are unchanged
// from g7. Tech is unchanged at {move:90, stack:0, prod:2, atk:4, def:4},
// the anchor every winning Conqueror cousin has kept.
export default {
  name: "Conqueror_g8_25adb0",
  author: "claude",
  version: 1,
  description: "Conqueror_g7 path-clear scoring inside Conqueror_g5_fbf131 walk-all-candidates fallback.",
  summary: `Parent Conqueror_g7_0cfdd6 lost season #37 to two cousins
(g4_868391 and g5_fbf131). The shared loss mode is the same one g4
itself eventually addressed: a single-best-pick 5x5 fallback can stall
when the chosen target's primary AND secondary directions both fail
tryCommit (capped friendlies, unbeatable enemies on the route). g7
made the *picking* smarter via two-axis path-clear scoring, but kept
the single-pick structure, so the stall still happens whenever the
"best" candidate is unreachable.

g5_fbf131 (one of the two bots that beat the parent) fixed it
structurally: walk every beatable candidate, commit on first success.
This descendant merges the two improvements — g7's smarter ordering
applied inside g5_fbf131's walk-all loop.

Sort key per stencil candidate is (dist asc, clear desc, weakness asc)
where clear = primary_passable * 2 + secondary_passable, exactly as
g7 computed. Walking proceeds in that order; for each candidate we
try its primary direction, then its secondary, then move on. The
candidate g7 would have picked is therefore tried FIRST (identical
sort keys); the only difference is that when prim+sec both fail we
move to the next candidate instead of giving up.

Same kill priority, same adjacent deferral, same tech anchor
({move:90, stack:0, prod:2, atk:4, def:4}). Path-clear ordering
remains valuable here because it still front-loads the highest-
probability candidates — most matches will commit on the first walk
step and never pay the extra cost.`,
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

    // Pass 1: strongest beatable adjacent enemy.
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
        const needed = enemy / BONUS + 0.6;
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

    // Pass 3: full stalemate. 5x5 walk-all-candidates with g7's
    // (dist, clear, weakness) ordering — same first pick as g7 but
    // doesn't bail if that pick's routes both fail.
    if (!tile.stencil5) return;
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

    // Collect every beatable stencil candidate as a flat tuple
    // (dist, clear, enemy, prim, sec). <=24 entries; bubble-sort fine.
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
    if (candidates.length === 0) return;

    const stride = 5;
    const n = candidates.length / stride;
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
        // sort: dist asc, clear desc, enemy asc
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
  },
};
