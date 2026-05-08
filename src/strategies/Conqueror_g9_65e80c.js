import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.6;
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

// Single-knob change vs parent g8_9d8b65: revert tech.
//
// Parent ran an experimental {move:80, stack:12, prod:2, atk:3, def:3}
// based on a model that lab1's maxArmy=12 made the stack knob worth
// trading 10 move points for. Season #115's evidence rejects it:
// all three bots that beat parent in recent losses
//   - Conqueror_g11_03759c (seed=22, finished 1st when parent was 3rd)
//   - Conqueror_g6_127cef  (seed=13, finished 1st when parent was 5th)
//   - Conqueror_g6_27c4e7  (seed=5,  finished 1st when parent was 4th)
// run *exactly* the lineage-standard {move:90, stack:0, prod:2,
// atk:4, def:4}. Parent's own tech is the only large feature of
// parent that those three winners do not share.
//
// The strategy code (hemisphere-weighted Pass 1, path-clear Pass 3,
// MARGIN=0.6, BACKING_WEIGHT=0.4) is left untouched. Those are
// orthogonal knobs to tech, and parent's strategy edge over older
// siblings (the hemisphere-weighted Pass 1 in particular) was
// independently good — the winners variously have it (g6_127cef,
// g6_27c4e7) or don't (g11_03759c) and still beat parent on tech.
// So the cleanest test is: keep parent's strategy code, swap only
// the tech back to the lineage default, and let the season tell us
// whether parent's strategy code on standard tech is competitive
// vs the field. If this descendant underperforms, the takeaway is
// that parent's strategy code itself is the weak link, not the tech
// experiment. If it overperforms parent, the maxArmy=12 stack
// argument was wrong and lineage-standard tech remains correct.
export default {
  name: "Conqueror_g9_65e80c",
  author: "claude",
  version: 1,
  description: "Parent g8_9d8b65 with tech reverted to lineage standard {move:90, stack:0, prod:2, atk:4, def:4} — the tech all 3 recent winners share.",
  summary: `Parent Conqueror_g8_9d8b65 made two bets vs its own
parent: (a) adopt hemisphere-weighted Pass 1 + path-clear Pass 3
from a sibling, and (b) shift 10 tech points from move to stack
to exploit lab1's maxArmy=12 cap. Season #115 records three
losses, and in every one the winning bot ran the lineage-default
tech {move:90, stack:0, prod:2, atk:4, def:4}:

  - seed=22 lost to Conqueror_g11_03759c (tech: 90/0/2/4/4)
  - seed=13 lost to Conqueror_g6_127cef  (tech: 90/0/2/4/4)
  - seed=5  lost to Conqueror_g6_27c4e7  (tech: 90/0/2/4/4)

Parent's tech is the most distinctive feature it does not share
with any of those winners. Two of the three winners (g6_127cef,
g6_27c4e7) actually carry the same hemisphere-weighted Pass 1 the
parent uses, so the strategy code is not what differentiated them
from parent — only tech did.

Single change here: revert tech to {move:90, stack:0, prod:2,
atk:4, def:4}. Strategy code (hemisphere-weighted Pass 1,
path-clear Pass 3, MARGIN=0.6, BACKING_WEIGHT=0.4) is byte-for-
byte identical to parent.

Expected effect: garrison floor returns to 0.6 (was 0.7 — saves
0.1 strength held back per attack), atk and def each gain a 10-
point output multiplier (~+10% offensive and defensive output),
prod stays put, stack drops to 0 returning storage cap to ~1.0x
of maxArmy. The tradeoff is the cap loss the parent argued for
on a maxArmy=12 board — but the tournament has spoken: bots at
~1.0x cap with stronger atk/def are eating bots at ~0.82x cap
with diluted atk/def, regardless of map size.

If this descendant underperforms parent the takeaway is that
parent's strategy code (hemisphere Pass 1 + path-clear Pass 3)
was the actual weak link and the tech revert merely uncovered
it. If it overperforms, parent's tech experiment was the
specific regression and standard tech + hemisphere strategy is
the right combination going forward.`,
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

    // Pass 1: hemisphere-weighted adjacent kill picker.
    let bestTile = null;
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
          bestTile = t;
          bestNeeded = needed;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasOtherTarget = true;
      }
    }
    if (bestTile) {
      army.attack(bestTile, bestNeeded);
      return;
    }

    // Pass 2: any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3: full stalemate. 5x5 stencil with distance-first,
    // path-clear tiebreak, weakness as final tiebreak.
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
