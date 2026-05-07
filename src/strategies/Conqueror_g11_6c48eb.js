import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.6;
const BACKING_WEIGHT = 0.4;

// Stencil5 hemispheres for direction d in {W=0,E=1,N=2,S=3}.
// HEMI[d] is the list of stencil5 indices that lie on that side
// of the center cell. Used to compute "structural enemy mass on
// the side we'd be attacking into".
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

// Parent Conqueror_g10_447dc3 lost season #74 across five matchups
// (seeds 153, 103, 78, 28, 15) - finished #4 or worse in four of
// five. Winners we have source for:
//
//   - g4_1f6790 (seed 153)        - strongest-beatable Pass 1
//   - g7_98d20f (seed 103)        - hemisphere Pass 1 + multi-cand Pass 3
//   - g7_efa4e0 (seed 78)         - hemisphere Pass 1
//
// Two of those three winners share the same Pass-1 trick: weight
// the adjacent kill priority by *enemy structural mass* on that
// side of the 5x5 stencil ("BACKING_WEIGHT * hemisphere_enemy"),
// not by friendly density around the target. The parent g10 does
// the OPPOSITE - it uses TERRITORY_BIAS (enemy + 0.3 *
// friendlyNbrs), which prefers deeply infiltrated enemies (a
// "wound to collapse"). Head-to-head evidence in season #74 is
// that the wound-collapse thesis loses to the wall-puncture
// thesis.
//
// The two heuristics are opposites:
//   - Territory bias targets enemies surrounded by *our* tiles
//     (small isolated cleanups).
//   - Hemisphere weight targets enemies on the side with more
//     *enemy* mass behind them (structural threats first).
//
// Against Membrane-style or stacked-frontier opponents, the
// wall-puncture read is the strictly defensive one: leaving a
// growing enemy mass behind a thin facade compounds. That is
// exactly the failure mode g7_efa4e0's commit message predicted
// and the parent's losses confirm.
//
// Net change vs parent:
//   Pass 1: replace territory-bias scoring with g7_efa4e0's
//           hemisphere-weighted scoring (BACKING_WEIGHT=0.4).
//           Adjacent enemy strength is still the dominant term
//           (1.0 vs 0.4 spread over up to 10 stencil cells), so
//           ties and near-ties go to the side with more enemy
//           depth - the structural mass worth puncturing first.
//   Pass 2: unchanged - Conqueror.act on any other adjacent
//           action.
//   Pass 3: unchanged from parent - 5x5 stencil with
//           multi-candidate iteration and honest path-clear
//           semantics. This is g7_98d20f's improved fallback,
//           which g7_efa4e0 does NOT have. So this descendant
//           hybrids the best demonstrated Pass 1 (g7_efa4e0's
//           hemisphere weight) with the best demonstrated Pass 3
//           (g10/g7_98d20f's multi-candidate iteration) - a
//           combination not present in any existing bot in the
//           pool.
//   Tech:   unchanged. {move:90, stack:0, prod:2, atk:4, def:4}
//           is the shared optimum across every recent winner in
//           this lineage; the parent's losses were about kill
//           priority, not allocation.
//
// MARGIN=0.6 also stays; every recent winner uses 0.6 and the
// parent already aligned with that on its Pass 1 commit.
export default {
  name: "Conqueror_g11_6c48eb",
  author: "claude",
  version: 1,
  description: "g10 with Pass 1 swapped from territory-bias to g7_efa4e0's hemisphere-weighted scoring; multi-candidate Pass 3 retained.",
  summary: `Parent Conqueror_g10_447dc3 lost season #74 across five
matchups (seeds 153, 103, 78, 28, 15) - finished #4 or worse four
times. Winners with source: g4_1f6790 (strongest-beatable Pass 1),
g7_98d20f (hemisphere Pass 1 + multi-candidate Pass 3), g7_efa4e0
(hemisphere Pass 1). Two of three share the hemisphere-weighted
Pass 1 trick.

The parent's Pass 1 uses TERRITORY_BIAS (enemy + 0.3 *
friendlyNbrs), which prefers deeply infiltrated enemies - a
"wound-to-collapse" thesis. The winners use the OPPOSITE
hemisphere-weighted thesis: enemy + 0.4 * stencil_enemy_mass on
that side, which prefers enemies sitting in front of more
structural depth - the "wall to puncture" first. Against
Membrane-style or stacked-frontier opponents, the wall-puncture
read is strictly more defensive: leaving a growing enemy mass
behind a thin facade compounds, which matches the parent's #4-#6
finishes.

Net change vs parent:
  Pass 1: territory-bias replaced with hemisphere-weighted scoring
    (BACKING_WEIGHT=0.4). Direct adjacent enemy still dominates
    (1.0 vs 0.4 spread over up to 10 cells); ties/near-ties go to
    the side with more enemy depth.
  Pass 2: unchanged - Conqueror.act on any other adjacent action.
  Pass 3: unchanged from parent - multi-candidate stencil iteration
    with honest path-clear semantics, ported from g7_98d20f. This
    is the piece g7_efa4e0 does NOT have, so this descendant fuses
    the best Pass 1 (g7_efa4e0) with the best Pass 3 (g7_98d20f /
    parent) - a combination not present in any existing bot.
  Tech: unchanged. {move:90, stack:0, prod:2, atk:4, def:4} is the
    shared optimum across every recent winner; the losses were
    about kill priority, not allocation. MARGIN=0.6 also stays.`,
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

    // Pass 1: best beatable adjacent enemy by hemisphere-weighted
    // threat score:
    //   score = enemy + BACKING_WEIGHT * hemisphere_enemy_mass
    // Adjacent enemy strength dominates (1.0 vs 0.4 over up to 10
    // cells); the hemisphere term is a tiebreaker that prefers
    // punching toward structural depth, not isolated facades.
    // (Ported from g7_efa4e0, which beat the parent in seed=78.)
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
    // iteration and honest path-clear semantics. (Unchanged from
    // parent g10 / g7_98d20f.)
    if (!stencil) {
      Conqueror.act(army, game);
      return;
    }

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
