import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Parent Conqueror_g7_98d20f used BUFFER=0.6 in both tryCommit
// (enemy / BONUS + 0.6 <= sLimit) and the matching isPassable
// cutoff. The bot that knocked the parent off the top last
// season (Conqueror_g11_15ba79, the only loss recorded against
// the parent in season #80) runs an almost identical chassis
// with BUFFER=0.3, the tail of a winning monotone lineage
// (0.6 -> 0.5 -> 0.4 -> 0.3, each generation winning its
// season). Post-attack margin at 0.3 is still 0.3 * 1.4 = 0.42
// strength, ~3000x the realistic float-precision floor (~1e-4),
// so the move is dominantly upside: kills at the feasibility
// edge land one tick earlier and 0.3 more strength stays in
// the garrison for Conqueror.act to spend on empty-grab or
// friendly-balance work the next tick.
const BUFFER = 0.3;

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
  name: "Conqueror_g8_90fd52",
  author: "claude",
  version: 1,
  description: "Conqueror_g7 chassis with BUFFER tightened from 0.6 to 0.3 to match the proven g11 lineage value.",
  summary: `Parent Conqueror_g7_98d20f introduced two upgrades over
its own parent: an honest path-clear cache (isPassable now mirrors
tryCommit's exact commit threshold) and a multi-candidate Pass 3
that iterates primary->secondary over every beatable stencil
target instead of all-or-nothing on the single best pick. Those
upgrades dominated through season #79 but the parent dropped one
match in season #80 to Conqueror_g11_15ba79, finishing #2 of 6
behind it on seed=5.

Conqueror_g11_15ba79 is essentially the parent's pre-multi-
candidate chassis with one constant tightened: BUFFER trimmed
from 0.6 to 0.3 across four generations (g8=0.6 -> g9=0.5 ->
g10=0.4 -> g11=0.3), each generation winning its season. The
thesis behind every notch was the same: post-attack margin at
the new BUFFER is still orders of magnitude above float-precision
(0.3 * 1.4 = 0.42 strength vs ~1e-4 numerical floor), so the
move is dominantly upside. Kills at the feasibility edge land
one tick earlier and the saved 0.3 strength per kill stays in
the garrison for Conqueror.act to spend on empty-grab or
friendly-balance work next tick.

This descendant ports the proven BUFFER=0.3 onto the parent's
multi-candidate Pass 3 chassis. The two ideas are orthogonal: the
buffer tightening helps every kill the bot makes, while the
multi-candidate fallback only fires in the rare full-stalemate
case where the top stencil pick has both cardinals blocked. So
the gain stacks rather than overlaps. Pass 1, Pass 2, the lenient
sLimit + 0.5 stencil filter (kept lenient because the stencil
target may be 2 hops out and growth may close the gap by
arrival), DIR_HINTS, and the {move:90, stack:0, prod:2, atk:4,
def:4} tech are unchanged from the parent.

Note that the isPassable cutoff is rewritten to match the new
tryCommit margin exactly (enemy / BONUS + BUFFER <= sLimit),
preserving the parent's "honest cache" property: the tiebreak
only fires when a lane is genuinely committable this tick.`,
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
        const needed = enemy / BONUS + BUFFER;
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

    // Cardinal passability cache, threshold matches tryCommit.
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
        v = (enemy / BONUS + BUFFER <= sLimit) ? 1 : 0;
      } else if (friendlyArmy) {
        v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
      } else {
        v = 1;
      }
      passCache[dir] = v;
      return v;
    };

    // Collect every beatable stencil enemy as a candidate.
    // Beatability stays at the lenient sLimit + 0.5 cutoff: the
    // stencil target is up to 2 hops away, growth and intervening
    // combat may close the gap by arrival. The tight cutoff lives
    // in isPassable, evaluating only the immediate neighbor we
    // commit to *this* tick.
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

    // Sort: closest first, primary-clear preferred, weakest last.
    candidates.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      const ca = isPassable(a.prim);
      const cb = isPassable(b.prim);
      if (ca !== cb) return cb - ca;
      return a.enemy - b.enemy;
    });

    // First successful commit wins; iterate to a sibling if both
    // cardinals on the top pick are unworkable.
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
