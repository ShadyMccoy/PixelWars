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

// Parent g9_1e065b lost season #105 (seed=16) to Conqueror_g8_25adb0.
// The two strategies share Pass 1 (strongest-beatable adjacent kill,
// optionally with parent's retake guard) and Pass 2 (Conqueror.act
// fallback for friendly/empty grabs). They differ only in Pass 3:
//
//   - Parent g9 picks ONE best stencil candidate using
//     (dist asc, clear desc, weakness asc), then tries its primary
//     direction, then secondary, then bails. If both routes fail
//     (capped friendly, unbeatable enemy on lane), the army wastes
//     the turn even when a slightly farther candidate is reachable.
//
//   - Winner g8_25adb0 keeps the same sort keys but walks EVERY
//     beatable candidate, committing on the first tryCommit that
//     succeeds. The candidate the parent would have picked is still
//     tried first (identical sort). The only behavioral change is
//     that prim+sec failure no longer ends the turn.
//
// This descendant lifts that walk-all-candidates Pass 3 into the g9
// shell. Tech (75/0/2/13/10) and the Pass 1 retake guard are kept
// from the parent — those were the parent's two big bets and the
// season #105 loss does not impeach them; it impeaches the stall
// path in Pass 3, which is already shared with g8_25adb0's parent
// and which g8_25adb0 fixed structurally.
//
// Reachability threshold for stencil collection stays at the
// parent's stricter `sLimit - 0.6` (matching tryCommit's commit
// margin) rather than g8_25adb0's looser `sLimit + 0.5`, so we
// don't pollute the candidate list with targets tryCommit would
// reject anyway.
//
// Hypothesis: in clean adjacency situations Pass 1 commits and the
// new Pass 3 never runs, so behavior is parent-identical. In the
// stall scenarios where the parent currently wastes turns (the loss
// mode), Pass 3 now finds a reachable substitute, recovering tempo
// without changing the priority of which target is tried first.
export default {
  name: "Conqueror_g10_a9c8bc",
  author: "claude",
  version: 1,
  description: "Conqueror_g9_1e065b with Conqueror_g8_25adb0's walk-all-candidates Pass 3 grafted in.",
  summary: `Parent g9_1e065b lost season #105 seed=16 to g8_25adb0.
Both share Pass 1 and Pass 2; the only structural difference is
Pass 3. Parent g9 single-best-picks a stencil candidate with
(dist asc, clear desc, weakness asc) and bails if its prim+sec
routes both fail. g8_25adb0 keeps the same ordering but walks every
beatable candidate, committing on the first tryCommit success.

This descendant grafts g8_25adb0's walk-all-candidates loop into
the g9 shell. The candidate g9 would have picked is still tried
first (identical sort keys); the difference is recovery from
prim+sec failure instead of a stalled turn.

Tech (75/0/2/13/10) and the Pass 1 retake guard are kept — those
were g9's two bets and the loss does not impeach either; it
impeaches the Pass 3 stall, which g8_25adb0 already fixed.

Reachability threshold for stencil collection stays at the
parent's stricter sLimit-0.6 (matching tryCommit's commit margin)
rather than g8_25adb0's looser sLimit+0.5, so we don't pollute
the candidate list with targets tryCommit would reject anyway.`,
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

    // Pass 1: strongest beatable adjacent enemy, with retake guard.
    let bestKill = null;
    let bestEnemy = -1;
    let bestNeeded = 0;
    let bestKillIdx = -1;
    let hasOtherTarget = false;
    const enemyAt = [0, 0, 0, 0];
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
        const needed = enemy / BONUS + 0.6;
        if (needed > sLimit) continue;
        if (enemy > bestEnemy) {
          bestEnemy = enemy;
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
      const remaining = army.strength - bestNeeded;
      let maxOther = 0;
      for (let i = 0; i < 4; i++) {
        if (i === bestKillIdx) continue;
        const e = enemyAt[i];
        if (e > maxOther) maxOther = e;
      }
      if ((maxOther - 1) * BONUS >= remaining) {
        Conqueror.act(army, game);
        return;
      }
      army.attack(bestKill, bestNeeded);
      return;
    }

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. Walk-all-candidates with g9's
    // (dist asc, clear desc, weakness asc) ordering. First pick is
    // identical to the parent; the difference is that we keep
    // walking when prim+sec both fail tryCommit instead of bailing.
    const stencil = tile.stencil5;
    if (!stencil) return;
    const viewer = army.player;
    const reachableEnemyOverBonus = sLimit - 0.6;

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
        v = (enemy / BONUS <= reachableEnemyOverBonus) ? 1 : 0;
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
      if (enemy / BONUS > reachableEnemyOverBonus) continue;
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
