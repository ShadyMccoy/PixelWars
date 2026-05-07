import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.6;
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

// Parent Conqueror_g9_c81d7f lost season #73 across four matchups
// (seeds 244, 186, 70, 44) - finished #5/6 three times and #4/6
// once. Two patterns are visible across the bots that beat it:
//
// (1) Margin gap. The parent uses MARGIN=0.4 in Pass 1's commit.
//     Every recent winner in this lineage (g7_98d20f, g7_31769b,
//     g4_3fd4ce) uses 0.6. The smaller margin lets the parent
//     accept fights with a thinner safety cushion - on near-ties
//     the +1.4 attacker-bonus rounding can flip the kill from a
//     clean overkill into a contested resolution that retakes us
//     next tick. Bumping MARGIN to 0.6 in line with the cousins
//     is the lowest-risk single tuning change.
//
// (2) Pass 3 dishonesty / single-pick stall. The parent's Pass 3
//     copies g6/g8's lenient isPassable (enemy/BONUS <= sLimit+0.5)
//     while tryCommit uses the strict cutoff. A whole band of
//     enemies in (sLimit-MARGIN, sLimit+0.5] reads as "passable"
//     for the tiebreak yet refuses the actual commit, so the
//     path-clear preference can pick a fake-clean lane over a
//     genuinely empty one. And Pass 3 still picks one best stencil
//     candidate and tries only its primary->secondary pair; if
//     both fail, the army stalls even when sibling stencil
//     candidates with clean lanes exist.
//
//     g7_98d20f fixed both of these (its diff against g6 is
//     localized to Pass 3) and beat the parent in season #73 seed
//     244. Porting both fixes here is the second behavioral
//     change.
//
// What stays from the parent:
//   - Pass 1's territory-bias score (enemy + 0.3 * friendlyNbrs).
//     The wound-collapse thesis is still right: a deeply-
//     infiltrated enemy with all-friendly neighbors should
//     outrank a slightly-larger frontier enemy floating in enemy
//     territory. That logic was inherited from g5_930cc7, which
//     beat g8 in season #67. Keeping it.
//   - Pass 2 (Conqueror.act on any other adjacent action).
//   - Tech {move:90, stack:0, prod:2, atk:4, def:4}, the shared
//     optimum across the winning Conqueror cousin lineage.
//
// Net: same Pass 1 thesis as the parent, but with the strict
// margin every recent winner uses, and with the Pass 3 fixes
// from the bot that beat the parent in head-to-head play.
export default {
  name: "Conqueror_g10_447dc3",
  author: "claude",
  version: 1,
  description: "g9 with MARGIN bumped to 0.6 and g7_98d20f's Pass 3 fixes (honest path-clear + multi-candidate iteration).",
  summary: `Parent Conqueror_g9_c81d7f finished #5/6 three times and
#4/6 once in season #73 (seeds 244, 186, 70, 44). Two issues line up
across the bots that beat it.

First, MARGIN. The parent commits at enemy/BONUS + 0.4, while every
recent winner in this lineage (g7_98d20f, g7_31769b, g4_3fd4ce) uses
0.6. The thinner cushion is dangerous on near-tie kills: with the
attacker bonus rounding, a 0.2-strength gap can flip a clean
overkill into a contested resolution that retakes us next tick.
Aligning MARGIN with the winning cousins is a one-constant change.

Second, Pass 3. The parent's isPassable uses the lenient
enemy/BONUS <= sLimit + 0.5 rule while tryCommit uses the strict
+MARGIN cutoff. Enemies in the gap read as "passable" for the
tiebreak but refuse the actual commit, so the path-clear preference
can pick a fake-clean lane over a genuinely empty one. And Pass 3
picks one best stencil candidate and tries only that pair; if both
fail (e.g. axial target with a truly blocked primary), the army
stalls. g7_98d20f fixed both of these and beat this parent in
season #73 seed 244. Porting both fixes verbatim.

What stays: Pass 1's territory-bias scoring (enemy + 0.3 *
friendlyNbrs), inherited via the parent from g5_930cc7's wound-
collapse thesis; Pass 2 (Conqueror.act on any other adjacent
action); the shared-optimum tech {move:90, stack:0, prod:2, atk:4,
def:4}.`,
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

    // Pass 1: best beatable adjacent enemy by territory-bias score
    //   score = enemy + TERRITORY_BIAS * friendlyNbrs
    // (inherited from parent / g5_930cc7's wound-collapse thesis).
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

    // Pass 3: full stalemate. 5x5 stencil with multi-candidate
    // iteration and honest path-clear semantics (ported from
    // g7_98d20f, which beat the parent in season #73 seed 244).
    if (!tile.stencil5) {
      Conqueror.act(army, game);
      return;
    }
    const stencil = tile.stencil5;
    const viewer = army.player;

    // Honest passability cache: v=1 iff a tryCommit on this
    // neighbor would actually succeed this tick. The enemy
    // threshold matches tryCommit's exact cutoff
    // (enemy / BONUS + MARGIN <= sLimit) so the tiebreak below is
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
        v = (enemy / BONUS + MARGIN <= sLimit) ? 1 : 0;
      } else if (friendlyArmy) {
        v = (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) ? 1 : 0;
      } else {
        v = 1;
      }
      passCache[dir] = v;
      return v;
    };

    // Collect every beatable stencil enemy as a candidate.
    // Beatability stays lenient (sLimit + 0.5) because the stencil
    // target is up to two hops away; growth and intervening combat
    // may close the gap by arrival. The strict cutoff lives in
    // isPassable, which evaluates the immediate neighbor we
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
    if (candidates.length === 0) {
      Conqueror.act(army, game);
      return;
    }

    // Sort: closest first, primary-clear preferred, weakest as the
    // final tiebreak. With isPassable now honest, "clear" reflects
    // a lane the engine will actually accept.
    candidates.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      const ca = isPassable(a.prim);
      const cb = isPassable(b.prim);
      if (ca !== cb) return cb - ca;
      return a.enemy - b.enemy;
    });

    // First successful commit wins. Iterating across candidates
    // means a top pick whose primary and secondary both fail
    // falls through to a sibling instead of wasting the tick.
    for (let c = 0; c < candidates.length; c++) {
      const cand = candidates[c];
      const primaryTarget = neighbors[cand.prim];
      if (primaryTarget && tryCommit(army, primaryTarget, sLimit, pid)) return;
      if (cand.sec < 0) continue;
      const secondaryTarget = neighbors[cand.sec];
      if (secondaryTarget && tryCommit(army, secondaryTarget, sLimit, pid)) return;
    }
    Conqueror.act(army, game);
  },
};
