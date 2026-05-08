import Conqueror from "./Conqueror.js";
import { sumStrength } from "../core/Army.js";

const BONUS = 1.4;
const MARGIN = 0.45;
const BACKING_WEIGHT = 0.4;
const RETAKE_WEIGHT = 0.3;

// Hemisphere indices for the 5x5 stencil. W=0, E=1, N=2, S=3.
// Each side's cells (axis cells excluded so hemispheres don't overlap).
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

// Parent g6_5a4345 lost season #94 in three different lineups (#3,
// #3, #5) to bots that each picked up a different validated upgrade
// the parent did not adopt:
//
//   - g5_b451ab: tightened MARGIN from 0.6 to 0.45. Picks up the
//     [enemy/BONUS + 0.45, enemy/BONUS + 0.60) band as actual kills
//     instead of stalls and leaves 0.15 less strength on the floor
//     per kill - compounding waste reduction in the parent style.
//
//   - g7_3b651e and g7_efa4e0: hemisphere-weighted backing in Pass 1
//     adjacent kill priority. Score adjacent beatable enemies by
//     enemy + 0.4 * sum of enemy strength in that direction's
//     hemisphere of the 5x5 stencil. Punches the wall where it's
//     thickest instead of just the strongest adjacent body.
//
// All three winners share the parent's tech {90,0,2,4,4} and run the
// same kernel skeleton, so the loss signal is squarely about Pass 1
// target selection, not allocation. Compose all three validated
// signals into one Pass 1 score, with the parent's own net retake
// threat (which credits friendly support that consolidates the
// capture - the parent's contribution and the right behavior under
// retake pressure) kept at reduced weight, since hemisphere backing
// partially overlaps the same geometry (target's other-side
// neighbor sits inside the hemisphere).
//
// Final score = enemy + 0.4 * hemi_enemy_backing
//                     - 0.3 * net_retake_threat
//
// Tech unchanged - the loss is about target selection, not the
// allocation, and the entire winning lineage shares 90/0/2/4/4.
export default {
  name: "Conqueror_g7_5acd36",
  author: "claude",
  version: 1,
  description: "g6 fused with hemisphere backing (g7_efa4e0/g7_3b651e) and tightened 0.45 margin (g5_b451ab).",
  summary: `Parent Conqueror_g6_5a4345 finished #3, #3, and #5 in
season #94 against three different validated upgrades it did not
adopt. This descendant fuses all three into Pass 1 (adjacent kill
priority):

  1. MARGIN 0.60 -> 0.45 (from g5_b451ab). The parent skipped every
     enemy where attackPower fell in [enemy/1.4 + 0.45,
     enemy/1.4 + 0.60); those are now real kills. Also leaves 0.15
     less strength on the floor per successful capture - the kind
     of compounding waste Conqueror was designed to fix. 0.45 still
     absorbs float jitter and small mid-tick reinforcements.

  2. Hemisphere-weighted enemy backing (from g7_efa4e0 and
     g7_3b651e). Bias adjacent kill choice toward the side with
     deeper enemy mass behind it - punch the wall where it's
     thickest. BACKING_WEIGHT = 0.4 over up to 10 stencil cells;
     adjacent enemy value (1.0) still dominates so close kills
     still anchor the choice.

  3. Parent's net retake threat (from g6_5a4345). Sum across the
     target's *other* cardinal neighbors of max(0, enemy -
     friendly). This is the parent's contribution and the only one
     of the three that credits friendly support for consolidating
     a capture - real and worth keeping. Weight dropped from 0.6
     to 0.3 because the hemisphere backing already partially
     overlaps this geometry (the target's far-side neighbor sits
     inside the same hemisphere) and we don't want to double-count.

Pass 2 / fallback unchanged: Conqueror.act handles non-kill
adjacent action and any other case.

Tech unchanged at 90/0/2/4/4. All three of the winning bots also
ran this allocation and the loss signal is squarely about Pass 1
target selection, not the tech allocation.`,
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

    let bestTile = null;
    let bestScore = -Infinity;
    let bestNeeded = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      let friendly = false;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      const needed = enemy / BONUS + MARGIN;
      if (needed > sLimit) continue;

      // Hemisphere backing: sum of enemy strength in the target-
      // direction hemisphere of the 5x5 stencil (10 cells, axis
      // excluded). Higher = thicker wall behind the target = better
      // place to punch through. From g7_efa4e0 / g7_3b651e.
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

      // Net retake threat across the target's *other* cardinals.
      // Per-tile clip at zero so a fat friendly on one side can't
      // mask a real enemy on another (next-tick movement can only
      // resolve one direction at a time). From parent g6_5a4345.
      let netThreat = 0;
      const tn = t.neighbors;
      for (let j = 0; j < 4; j++) {
        const tt = tn[j];
        if (!tt || tt === tile) continue;
        const ttArmies = tt.armies;
        let tnE = 0;
        let tnF = 0;
        for (let k = 0; k < ttArmies.length; k++) {
          const a = ttArmies[k];
          if (a.player.id === pid) tnF += a.strength;
          else tnE += a.strength;
        }
        const net = tnE - tnF;
        if (net > 0) netThreat += net;
      }

      const score = enemy + BACKING_WEIGHT * backing - RETAKE_WEIGHT * netThreat;
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
    Conqueror.act(army, game);
  },
};
