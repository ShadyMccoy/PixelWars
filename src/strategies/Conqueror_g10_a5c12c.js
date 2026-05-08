import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.4;
// Hemisphere-weighted enemy backing. Same value as parent g9_ee6e4c
// (which inherited from g9_fd075f's season-#93 win on seed=30).
const BACKING_WEIGHT = 0.4;

// Hemisphere indices for the 5x5 stencil. W=0, E=1, N=2, S=3 -> the
// stencil cells on that side. Used to score "how much enemy mass is
// backing this adjacent enemy" so we kill the most-dangerous one
// first.
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

// No-margin kill, preserved verbatim. Final safety net when every
// neighbor is either a too-strong enemy or a full friendly: spend
// full sLimit on the weakest "too strong" pure-enemy neighbor.
// Strict kill threshold: sLimit * BONUS * atkMult > enemy * defMult.
function tryNoMarginKill(army, neighbors, sLimit, pid) {
  if (sLimit <= 0.5) return;
  const myMults = army.player.techMults;
  const atkMult = (myMults && myMults.atk) || 1;
  const effBonus = BONUS * atkMult;
  let best = null;
  let bestEnemy = Infinity;
  for (let i = 0; i < 4; i++) {
    const t = neighbors[i];
    if (!t) continue;
    const tArmies = t.armies;
    if (tArmies.length === 0) continue;
    let enemy = 0;
    let mixed = false;
    let maxDef = 1;
    for (let k = 0; k < tArmies.length; k++) {
      const a = tArmies[k];
      if (a.player.id === pid) {
        mixed = true;
        continue;
      }
      enemy += a.strength;
      const dm = (a.player.techMults && a.player.techMults.def) || 1;
      if (dm > maxDef) maxDef = dm;
    }
    if (enemy <= 0) continue;
    if (mixed) continue;
    const killCeiling = (sLimit * effBonus) / maxDef - 0.05;
    if (enemy >= killCeiling) continue;
    if (enemy < bestEnemy) {
      bestEnemy = enemy;
      best = t;
    }
  }
  if (best) army.attack(best, sLimit);
}

// Parent g9_ee6e4c dominated its season -- the kill-priority signal
// (hemisphere enemy-backing, BACKING_WEIGHT=0.4) and the no-margin
// stall-breaker are working. The lever this descendant pulls is
// TECH, not strategy. The lineage prompt explicitly flags tech as
// under-explored: most descendants preserve the parent's split and
// only tune code, leaving free win-rate on the table.
//
// Parent tech 90/0/2/4/4 has an obvious mismatch with its own
// strategy: the strategy is built around killing adjacent enemies,
// but `atk = 4` lands the attack multiplier *below* the neutral
// baseline (~0.94x vs 1.0x at tech 20). Move=90 is essentially
// maxed (garrison 1.05, only 0.05 below the floor at tech 100), so
// further moves up that axis return almost nothing. The kill code
// path benefits from atk twice:
//
//   1. The MARGIN=0.4 kill formula `needed = enemy/BONUS + MARGIN`
//      assumes BONUS=1.4 with no atk multiplier. Bumping atkMult
//      directly grows the post-fight surplus, leaving more
//      strength on captured tiles (extends ownership margin).
//
//   2. tryNoMarginKill's `killCeiling = sLimit*BONUS*atkMult/maxDef`
//      uses real atkMult. A higher atk lets the stall-breaker kill
//      enemies the parent would have left alone.
//
// Reallocation: shift 20 points from move (90 -> 70) to atk
// (4 -> 24). Garrison rises from 1.05 to 1.15 -- still well below
// the neutral 1.4 garrison, so most of move's value is preserved.
// atkMult swings from ~0.94x to ~1.02x, a ~8% improvement in
// effective forward strength -- compounded across the many kills
// per match this strategy launches.
//
// Strategy code: unchanged from parent. Hemisphere scoring,
// MARGIN=0.4, no defensive guard, no-margin stall-breaker, mixed-
// owner tile skips -- all preserved verbatim.
export default {
  name: "Conqueror_g10_a5c12c",
  author: "claude",
  version: 1,
  description: "Parent g9_ee6e4c with tech rebalanced: 20 points shifted from move (90->70) to atk (4->24) so the kill-heavy strategy actually runs on a kill-favoring tech.",
  summary: `Parent Conqueror_g9_ee6e4c dominated its season -- the
hemisphere-enemy-backing kill priority (BACKING_WEIGHT=0.4), the
removed defensive guard, and the no-margin stall-breaker are all
working. There is no losing matchup pointing at a strategy fix.

What the prompt does flag is tech under-exploration: most
descendants in this lineage preserve the parent's tech and tune
only code, so the strategy and the tech are not co-designed. The
parent's tech 90/0/2/4/4 is the canonical example -- it is built
for pushing forward (move=90 leaves only 1.05 garrison) but lands
its kill multiplier *below* the neutral baseline (atk=4 -> atkMult
~0.94x). The kill-priority code is doing serious work on a tech
that does not amplify the kills.

This descendant is a tech-only change: move 90->70, atk 4->24.
Strategy code is byte-identical to the parent.

Why the swap is favorable:

  * Move at tech 90 is near the floor (garrison 1.05). The
    remaining 10 points yield only 0.05 strength on the
    attackPower side -- diminishing returns are extreme at the
    top of the move axis. Dropping to tech 70 raises garrison to
    1.15, giving up 0.10 per attack on the forward stack.

  * Atk at tech 4 is near the basement. Moving to tech 24 puts
    atkMult slightly above the neutral 1.0x baseline. Effective
    forward strength (sent * BONUS * atkMult) grows roughly 8%.
    This compounds:
      - Every adjacent kill leaves a larger post-fight surplus on
        the captured tile -- ownership margin and continued
        forward pressure both improve.
      - tryNoMarginKill's killCeiling (= sLimit*BONUS*atkMult/
        maxDef) widens, letting the stall-breaker kill enemies
        the parent had to leave alone.

  * Net trade: ~2-3% loss on raw forward stack vs ~8% gain on
    kill efficiency, applied across many kills per match.

Preserved from parent:
  * MARGIN = 0.4 (post-kill surplus 0.4*1.4 = 0.56 baseline,
    larger now thanks to higher atk -- atk is a free margin top-up
    on top of MARGIN, so reducing MARGIN here would forfeit the
    gain).
  * No defensive guard.
  * Hemisphere enemy-backing kill priority (BACKING_WEIGHT=0.4).
  * No-margin kill stall-breaker.
  * Mixed-owner tile skips and Conqueror.act fallback.
  * stack=0, prod=2, def=4 -- the non-load-bearing knobs in the
    parent's loadout, kept where they were since changing them
    would dilute the move<->atk experiment.

Risk: at move=70 vs move=90 we leave 0.10 more strength behind on
each attacker. In long sequences of small-stack attacks (early
expansion against weak neighbors) this could starve the front
slightly. But the kill-multiplier gain applies on every fight,
including those small-stack expansions, and the stall-breaker is
strictly more capable at higher atk -- so the expected effect is
favorable across the match arc.`,
  tech: { move: 70, stack: 0, prod: 2, atk: 24, def: 4 },
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

    let bestTile = null;
    let bestScore = -1;
    let bestNeeded = 0;
    let hasNonStallMove = false;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) {
        hasNonStallMove = true;
        continue;
      }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (friendlyArmy && enemy > 0) {
        // Mixed tile -- defer to Conqueror.
        hasNonStallMove = true;
        continue;
      }
      if (friendlyArmy) {
        if (friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
          hasNonStallMove = true;
        }
        continue;
      }
      // Pure-enemy tile.
      const needed = enemy / BONUS + MARGIN;
      if (needed > sLimit) continue;
      hasNonStallMove = true;

      // Hemisphere enemy-backing: how much enemy mass sits behind
      // this adjacent enemy in the 5x5 view. Higher backing =
      // bigger incoming push if not killed now.
      let backing = 0;
      if (stencil) {
        const idxs = HEMI[i];
        for (let m = 0; m < idxs.length; m++) {
          const cell = stencil[idxs[m]];
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
    }

    if (bestTile) {
      army.attack(bestTile, bestNeeded);
      return;
    }

    if (hasNonStallMove) {
      Conqueror.act(army, game);
      return;
    }

    // True standoff: every neighbor is too-strong-enemy or
    // full-friendly. Spend the forward stack on the weakest
    // beatable-by-strict-threshold enemy.
    tryNoMarginKill(army, neighbors, sLimit, pid);
  },
};
