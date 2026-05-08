import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.6;
const BACKING_WEIGHT = 0.4;

// Hemisphere indices for the 5x5 stencil. W=0, E=1, N=2, S=3 -> the
// stencil cells on that side, with axis cells excluded so hemispheres
// don't overlap.
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

// Parent Conqueror_g7_3b651e composed two g6 cousin improvements
// (hemisphere-weighted adjacent kill in Pass 1, path-clear tiebreak
// in Pass 3) and lost season #98 to two bots:
//
//   * Conqueror_g7_98d20f (seed=19) — same g6 ancestor, but
//     identified two latent bugs in the Pass 3 stalemate fallback:
//
//       (a) The isPassable cache lies: it counts an adjacent enemy
//           as "passable" whenever enemy / BONUS <= sLimit + 0.5,
//           but tryCommit only commits when enemy / BONUS + 0.6
//           <= sLimit. Enemies in the gap (sLimit - 0.6, sLimit
//           + 0.5] are reported clear yet refuse the actual commit.
//           So the path-clear tiebreak we inherited from g6_aa7266
//           can prefer a fake-clean lane over an actually-empty
//           one when both are equidistant.
//
//       (b) Pass 3 picks one best stencil target and tries only
//           its primary then secondary cardinal. If both fail
//           (truly blocked primary plus an axial target whose
//           secondary == -1), the army stalls even though sibling
//           candidates with clean lanes exist.
//
//   * Conqueror_g8_174911 (seed=11) — orthogonal lever on Pass 1
//     (MARGIN 0.6 -> 0.4 with reach scoring + defensive guard).
//     Genuinely orthogonal but a much larger surface change to the
//     pass that already determines most of the bot's decisions.
//
// This descendant takes the smaller, more clearly correct fix from
// 98d20f and composes it with the parent's hemisphere-weighted Pass
// 1. The two improvements run on different passes and on disjoint
// entry conditions (Pass 1 only fires when there's a beatable
// adjacent enemy; Pass 3 only fires when no adjacent move exists),
// so the composition is mechanical, not a redesign.
//
// Pass 1, Pass 2, BONUS, MARGIN, the lenient stencil beatability
// filter (kept lenient because the stencil target is up to 2 hops
// away and growth may close the gap by arrival), and the tech are
// all preserved. The diff is localised to the post-stalemate
// fallback, the same path the parent already touched.
//
// Tech unchanged at 90/0/2/4/4 — the shared optimum across the
// winning Conqueror_g4+ branch. No signal from this loss that the
// tech is wrong.
export default {
  name: "Conqueror_g8_30b712",
  author: "claude",
  version: 1,
  description: "Hemisphere-weighted Pass 1 (g7_3b651e) + honest path-clear cache and multi-candidate Pass 3 iteration (g7_98d20f).",
  summary: `Parent Conqueror_g7_3b651e finished #5 of 6 in season #98
seed=19, beaten by Conqueror_g7_98d20f, and #4 of 6 in seed=11,
beaten by Conqueror_g8_174911. The 98d20f loss is the more
actionable signal: 98d20f is a sibling on the same g6 ancestor and
diagnoses two concrete latent bugs in the Pass 3 stalemate fallback
that we inherited from g6_aa7266.

Bug 1: the isPassable cache uses a different beatability threshold
than tryCommit. isPassable returns 1 when enemy / BONUS <= sLimit +
0.5; tryCommit only commits when enemy / BONUS + MARGIN (0.6)
<= sLimit. Enemies in the gap (sLimit - 0.6, sLimit + 0.5] count as
passable for the path-clear tiebreak yet refuse the actual commit.
The very tiebreak we added in g6_aa7266 can prefer a fake-clean
primary over an actually-empty one.

Bug 2: Pass 3 commits to one best stencil target and tries only its
primary then secondary cardinal. When both fail (truly blocked
primary plus an axial target with no secondary, for example), the
army stalls even when sibling stencil candidates with clean lanes
exist. The path-clear tiebreak ordered the top pick but never fell
through.

This descendant fixes both, leaving Pass 1 (hemisphere-weighted
adjacent kill) and Pass 2 (Conqueror.act) untouched:

  - isPassable now mirrors tryCommit's exact cutoff
    (enemy / BONUS + MARGIN <= sLimit), so the tiebreak only fires
    when the lane is genuinely committable this tick.
  - Pass 3 collects every beatable stencil candidate, sorts by
    (distance asc, primary-clear desc, weakness asc), and iterates
    primary -> secondary on each until one tryCommit lands. Every
    escape the stencil sees becomes a chance at motion.

The lenient stencil beatability filter (sLimit + 0.5) is kept,
because the stencil target is up to 2 hops away and growth may
close the gap before arrival; the tight cutoff lives in isPassable,
which evaluates the immediate neighbour we commit to this tick.

The 174911 loss reflects an orthogonal lever (MARGIN 0.6 -> 0.4 in
Pass 1) that's more invasive and risks changing the pass that
already produces most of the parent's wins. We pick the smaller,
clearly-correct fix here and let the lineage decide later whether
to also re-tune Pass 1 aggression.

Tech 90/0/2/4/4 preserved -- the shared optimum across the winning
lineage; no signal from either loss that the tech is wrong.`,
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

    // Pass 1: hemisphere-weighted adjacent kill picker (unchanged
    // from parent g7_3b651e -- this is the pass that produces most
    // of the bot's wins).
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

    // Pass 3: full stalemate. 5x5 stencil with multi-candidate
    // iteration and an honest path-clear cache. Replaces the
    // parent's single-candidate version (inherited from g6_aa7266)
    // with the fix from g7_98d20f.
    if (!stencil) return;

    // Cardinal passability cache. v=1 means a tryCommit on this
    // neighbour would actually succeed *this tick*. The enemy
    // threshold mirrors tryCommit's exact cutoff (enemy / BONUS +
    // MARGIN <= sLimit), so the tiebreak below is honest about
    // what is reachable -- the parent's threshold was sLimit + 0.5,
    // which counted unreachable enemies as clear lanes.
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

    // Collect every beatable stencil enemy as a candidate. The
    // lenient sLimit + 0.5 filter is intentional: the stencil
    // target is up to 2 hops away and growth/intervening combat
    // may close the gap by arrival. The tight cutoff lives in
    // isPassable above, which judges the immediate commit.
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
