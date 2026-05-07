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

// Parent Conqueror_g6_aa7266 dominated season #35 (no recorded
// losses) on the proven {move:90, stack:0, prod:2, atk:4, def:4}
// tech and a 3-pass kernel: strongest-first adjacent kill, then
// Conqueror.act, then a 5x5 closest-first stalemate fallback with
// a path-clear tiebreaker.
//
// Two residual issues remain in the parent's Pass 3:
//
// (1) The path-clear cache lies. isPassable returns 1 for an
//     adjacent enemy whenever enemy / BONUS <= sLimit + 0.5, but
//     tryCommit only succeeds when enemy / BONUS + 0.6 <= sLimit
//     (i.e. enemy / BONUS <= sLimit - 0.6). Enemies that fall in
//     the gap (sLimit - 0.6, sLimit + 0.5] count as "passable"
//     for the tiebreak yet refuse the actual commit. The very
//     decision the tiebreak is supposed to make - "this lane is
//     usable" - can be wrong by more than 1 strength unit.
//
// (2) Pass 3 picks one best stencil target and tries only its
//     primary then secondary cardinal. If both fail (e.g. primary
//     is truly blocked, and the target is axial so secondary == -1)
//     the army stalls even when sibling stencil candidates with
//     clean lanes exist. The path-clear tiebreak partially
//     mitigated this by preferring an open primary on equidistant
//     candidates, but only the single best is ever attempted.
//
// This descendant fixes both:
//   - isPassable now uses tryCommit's actual threshold
//     (enemy / BONUS + 0.6 <= sLimit), so the tiebreak reflects
//     what is genuinely committable this tick.
//   - Pass 3 builds the full candidate list, sorts by
//     (distance asc, primary-clear desc, weakness asc), and
//     iterates - trying primary then secondary for each - until
//     one tryCommit lands. Every escape the stencil sees becomes
//     a chance at motion instead of all-or-nothing on the top pick.
//
// Pass 1, Pass 2, BONUS, the lenient stencil beatability filter
// (kept lenient because the stencil target is up to 2 hops away
// and growth may close the gap by arrival), and the tech are
// untouched. The diff is localized to a code path that only fires
// when the immediate neighborhood is already deadlocked, so the
// downside risk on already-winning matchups is small.
export default {
  name: "Conqueror_g7_98d20f",
  author: "claude",
  version: 1,
  description: "Conqueror_g6 with honest path-clear semantics and a multi-candidate Pass 3 fallback.",
  summary: `Parent Conqueror_g6_aa7266 inherited Conqueror_g5's
undefeated-season tech ({move:90, stack:0, prod:2, atk:4, def:4})
and added a path-clear tiebreak to the 5x5 stalemate fallback. It
dominated season #35 with no recorded losses, so the gain target
shifts to residual inefficiency in Pass 3.

Two issues remain there.

First, the parent's isPassable cache uses a different beatability
threshold than tryCommit. isPassable counts an enemy as passable
when enemy / BONUS <= sLimit + 0.5; tryCommit only commits when
enemy / BONUS + 0.6 <= sLimit. Enemies in the gap
(sLimit - 0.6, sLimit + 0.5] are "passable" for the tiebreak yet
unreachable in practice, which lets the tiebreak prefer a fake-clean
primary over an actually-empty one when both candidates are
equidistant.

Second, Pass 3 commits to one best stencil target and tries only
its primary then secondary cardinal. When both fail (a truly
blocked primary plus an axial target with no secondary, for
example), the army stalls even though sibling stencil targets with
clean lanes are right there. The tiebreak helped order the top
pick but never fell through to the next.

This descendant fixes both:
  - isPassable now mirrors tryCommit's exact cutoff, so the
    tiebreak only fires when the lane is genuinely committable.
  - Pass 3 collects every beatable stencil candidate, sorts by
    (distance asc, primary-clear desc, weakness asc), and iterates
    primary->secondary on each until one commit succeeds.

Pass 1, Pass 2, the BONUS constant, the lenient stencil
beatability filter (kept lenient because the stencil target is up
to two hops out), and the tech are unchanged. The diff lives
entirely in the post-stalemate fallback, so the path that produced
the parent's domination is preserved.`,
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

    // Pass 3: full stalemate. 5x5 with multi-candidate iteration.
    if (!tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;

    // Cardinal passability cache. v=1 means a tryCommit on this
    // neighbor would succeed *this tick*; v=0 means it would
    // refuse. The enemy threshold matches tryCommit's exact cutoff
    // (enemy / BONUS + 0.6 <= sLimit) so the tiebreak below is
    // honest about what is actually reachable.
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
        v = (enemy / BONUS + 0.6 <= sLimit) ? 1 : 0;
      } else if (friendlyArmy) {
        v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
      } else {
        v = 1;
      }
      passCache[dir] = v;
      return v;
    };

    // Collect every beatable stencil enemy as a candidate.
    // Beatability stays the lenient sLimit + 0.5 used by the
    // parent: the stencil target is up to 2 hops away, growth and
    // intervening combat may close the gap by arrival. The tight
    // cutoff lives in isPassable, which evaluates the immediate
    // neighbor we commit to *this* tick.
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

    // Sort: closest first, primary-clear preferred, weakest as a
    // final tiebreak. With isPassable now honest, "clear" reflects
    // a lane the engine will actually accept.
    candidates.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      const ca = isPassable(a.prim);
      const cb = isPassable(b.prim);
      if (ca !== cb) return cb - ca;
      return a.enemy - b.enemy;
    });

    // First successful commit wins. Iterating instead of single-
    // pick means a top candidate whose primary and secondary are
    // both unworkable falls through to a sibling rather than
    // wasting the tick.
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
