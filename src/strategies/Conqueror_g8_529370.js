import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
// Lowered from parent's 0.6. g8_174911 demonstrated this opens kills
// in the near-parity band (sLimit - 0.6, sLimit - 0.4] that the parent
// refused. Post-kill surplus is still 0.4 * 1.4 = 0.56 -- positive.
const MARGIN = 0.4;
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

// Parent g7_3b651e (hemisphere-weighted Pass 1 + path-clear Pass 3)
// lost season #97 to two distinct improvements on its kernel:
//
//   * g7_98d20f: fixed two real Pass 3 bugs --
//       (a) isPassable used a different beatability threshold than
//           tryCommit, so the path-clear tiebreak could prefer a
//           lane the engine would actually refuse;
//       (b) Pass 3 only ever attempted the single best candidate's
//           primary then secondary cardinal -- if both failed (e.g.
//           axial target with no secondary), the army stalled even
//           with sibling stencil candidates available.
//
//   * g8_174911: lowered MARGIN 0.6 -> 0.4 with reach-weighted
//     scoring. Opens near-parity adjacent kills the parent refused.
//
// All three changes are orthogonal:
//   - The MARGIN reduction lives in the adjacent-kill threshold;
//     parent's hemisphere weighting *picks among* beatable kills and
//     is unaffected by widening the beatable set.
//   - The Pass 3 fixes live in the post-stalemate fallback, gated on
//     no adjacent move existing at all -- a strictly different
//     entry condition from Pass 1.
//
// This descendant composes all three:
//   Pass 1: hemisphere-weighted adjacent kill (from parent), now at
//           MARGIN=0.4 (from g8_174911). Hemisphere backing is
//           computed from sumStrength on the 5x5 enemy-mass behind
//           the candidate, so the "score" units are commensurate
//           regardless of the kill threshold; lowering MARGIN just
//           expands the candidate set.
//   Pass 2: Conqueror.act for any other adjacent action.
//   Pass 3: multi-candidate stencil iteration with honest
//           isPassable threshold (both from g7_98d20f).
//
// Tech 90/0/2/4/4 preserved -- all three winning siblings keep it
// and the loss signal is about kernel logic, not tech allocation.
export default {
  name: "Conqueror_g8_529370",
  author: "claude",
  version: 1,
  description: "g7_3b651e + MARGIN 0.6->0.4 (g8_174911) + honest isPassable + multi-candidate Pass 3 (g7_98d20f).",
  summary: `Parent Conqueror_g7_3b651e finished #4 then #5 in season
#97, beaten by g7_98d20f and g8_174911. Both winners attack
different weaknesses of the parent kernel:

  * g7_98d20f fixed Pass 3. The parent's isPassable cache used a
    looser beatability threshold than tryCommit, so the path-clear
    tiebreak could promote a lane that the engine would refuse to
    commit to. And Pass 3 only tried one stencil candidate's
    primary then secondary cardinal; if both failed the army
    stalled even when sibling candidates with clean lanes existed.

  * g8_174911 lowered MARGIN from 0.6 to 0.4. The parent refused
    kills in (sLimit - 0.6, sLimit - 0.4]; 0.4 still leaves a
    0.4 * 1.4 = 0.56 surplus on capture, which is positive
    ownership.

These three fixes are orthogonal:

  - Lowering MARGIN widens the beatable adjacent set; hemisphere
    weighting still picks among that set by depth-of-enemy-backing.
    The parent's selection logic is unchanged in shape -- it just
    sees more candidates.
  - Pass 3 only fires when there's no adjacent move at all, a
    strictly different entry condition from Pass 1. The Pass 3
    fixes do not touch Pass 1.

Composition:

1. Pass 1 -- HEMISPHERE-WEIGHTED ADJACENT KILL at MARGIN=0.4.
   Score = enemy + 0.4 * (5x5 enemy mass behind that lane). Pick
   the highest-scoring beatable enemy. Lower margin captures the
   near-parity kills the parent refused while keeping the
   hemisphere signal that distinguishes deep-backed lanes from
   isolated facades.

2. Pass 2 -- defer to Conqueror.act for any other adjacent action.

3. Pass 3 -- MULTI-CANDIDATE STENCIL with honest path-clear.
   Build the full beatable-stencil candidate list. Sort by
   (distance asc, primary-clear desc, weakness asc). Iterate,
   trying primary then secondary on each, until one tryCommit
   lands. isPassable now uses tryCommit's exact cutoff
   (enemy / BONUS + MARGIN <= sLimit), so the tiebreak reflects
   committable lanes instead of fictional ones.

Tech 90/0/2/4/4 preserved -- all three winning siblings retain it
and the loss signal points at kernel logic, not allocation.`,
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

    // Pass 1: hemisphere-weighted adjacent kill at MARGIN=0.4.
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

    // Pass 3: full stalemate. Multi-candidate stencil iteration.
    if (!stencil) return;

    // Honest path-clear cache: cutoff matches tryCommit exactly
    // (enemy / BONUS + MARGIN <= sLimit), so "clear" reflects
    // a lane the engine actually accepts.
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

    // Collect every beatable stencil enemy. Beatability stays
    // lenient (sLimit + 0.5) because the stencil target is up to 2
    // hops away -- growth and intervening combat may close the gap
    // by arrival. The tight cutoff lives in isPassable for the
    // immediate cardinal we commit to *this* tick.
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

    candidates.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      const ca = isPassable(a.prim);
      const cb = isPassable(b.prim);
      if (ca !== cb) return cb - ca;
      return a.enemy - b.enemy;
    });

    // First successful commit wins. Iterating instead of single-
    // pick converts more stencil intent into actual motion.
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
