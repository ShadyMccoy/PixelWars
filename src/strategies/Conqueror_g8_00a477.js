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

// Parent g7_efa4e0 lost season #99 in three games. The two winners
// whose deltas we can identify (g7_98d20f at seed=22, g5_edeed5 at
// seed=5) BOTH attack the same weakness: the parent's Pass 3
// stalemate fallback. The parent picks ONE best stencil candidate
// and tries only its primary then secondary cardinal. If both fail
// (truly blocked primary plus an axial target whose secondary == -1),
// the army stalls — even though sibling stencil candidates with
// clean lanes are right there. Worse, the parent's isPassable
// tiebreak uses enemy/BONUS <= sLimit + 0.5 while tryCommit only
// commits at enemy/BONUS + MARGIN <= sLimit, so the tiebreak
// counts a "passable" lane the commit will refuse — picking a
// fake-clean primary over a genuinely empty one on equidistant ties.
//
// Both g7_98d20f and g5_edeed5 win by replacing the single-pick
// Pass 3 with walk-all-candidates iteration: collect every beatable
// stencil enemy, sort by (distance asc, primary-clear desc,
// weakness asc), then iterate primary->secondary on each until one
// tryCommit lands. g7_98d20f additionally fixes isPassable to use
// the honest tryCommit cutoff. Two independent winners using the
// same fix is strong evidence — graft it.
//
// This descendant keeps the parent's Pass 1 untouched (the
// hemisphere-weighted kill priority is the parent's whole edge over
// its grandparent and not what the losses are about) and replaces
// only Pass 3:
//   - isPassable now mirrors tryCommit's exact cutoff
//     (enemy/BONUS + MARGIN <= sLimit), so the tiebreak is honest.
//   - Pass 3 collects every beatable stencil candidate, sorts, and
//     iterates primary->secondary on each until one commits.
//
// Tech unchanged at {move:90, stack:0, prod:2, atk:4, def:4}: the
// shared optimum, and the walk-all-candidates fallback specifically
// rewards mobile reserves (more candidates that can convert to a
// successful step), so high-move compounds with the new fallback.
export default {
  name: "Conqueror_g8_00a477",
  author: "claude",
  version: 1,
  description: "Conqueror_g7_efa4e0 with honest isPassable + walk-all-candidates Pass 3 (lifted from g7_98d20f / g5_edeed5).",
  summary: `Parent Conqueror_g7_efa4e0 lost season #99 in three games.
Two of the winners whose deltas can be identified (g7_98d20f at
seed=22, g5_edeed5 at seed=5) attack the same weakness: the parent's
Pass 3 fallback picks ONE best stencil candidate and tries only its
primary then secondary cardinal. If both fail — a blocked primary
plus an axial target whose secondary == -1 — the army stalls even
when sibling stencil candidates with clean lanes are right there.
Additionally the parent's isPassable tiebreak uses enemy/BONUS <=
sLimit + 0.5 while tryCommit only commits at enemy/BONUS + MARGIN
<= sLimit, so the "clear-primary" tiebreak can prefer a lane the
engine will refuse over a genuinely empty one on equidistant ties.

Both winners replace single-pick Pass 3 with walk-all-candidates
iteration. g7_98d20f additionally repairs isPassable. Two
independent winners using the same fix is strong evidence.

This descendant grafts that fix:
  Pass 1 unchanged: hemisphere-weighted kill priority. That's the
    parent's edge over its grandparent and not what these losses
    are about.
  Pass 2 unchanged: Conqueror.act for non-kill adjacent action.
  Pass 3 replaced:
    - isPassable now mirrors tryCommit's exact cutoff
      (enemy/BONUS + MARGIN <= sLimit), so the tiebreak only
      fires when the lane is genuinely committable.
    - Collects every beatable stencil candidate, sorts by
      (distance asc, primary-clear desc, weakness asc), and
      iterates primary->secondary on each until one tryCommit
      lands. Every escape the stencil sees becomes a chance at
      motion instead of all-or-nothing on the top pick.

Tech unchanged at {move:90, stack:0, prod:2, atk:4, def:4}. The
walk-all-candidates fallback rewards mobile reserves — more
candidates that can convert to a successful step — so high-move
compounds with the new fallback rather than sitting idle in
stalls.`,
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

    // Pass 1 (unchanged from parent): hemisphere-weighted adjacent
    // kill priority. Track hasOtherTarget for Pass 2 fallback.
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

    // Pass 2 (unchanged): any other adjacent action -> Conqueror's kernel.
    if (hasOtherTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Pass 3 (replaced): walk-all-candidates 5x5 stalemate fallback
    // with honest isPassable. Lifted from g7_98d20f / g5_edeed5.
    if (!stencil) return;

    // Cardinal passability cache. v=1 means tryCommit on this
    // neighbor would *actually* succeed this tick — threshold
    // matches tryCommit exactly so the tiebreak below is honest.
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
        v = (enemy / BONUS + MARGIN <= sLimit) ? 1 : 0;
      } else if (friendlyArmy) {
        v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
      } else {
        v = 1;
      }
      passCache[dir] = v;
      return v;
    };

    // Collect every beatable stencil candidate. Lenient sLimit + 0.5
    // bound: stencil targets are up to 2 hops away, growth and
    // intervening combat may close the gap by arrival. The tight
    // cutoff lives in isPassable for the immediate-neighbor commit.
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

    // Sort: closest first, primary-clear preferred, weakest tiebreak.
    candidates.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      const ca = isPassable(a.prim);
      const cb = isPassable(b.prim);
      if (ca !== cb) return cb - ca;
      return a.enemy - b.enemy;
    });

    // First successful commit wins; iterate so a top candidate whose
    // primary and secondary are both unworkable falls through to a
    // sibling rather than wasting the tick.
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
