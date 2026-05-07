import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Parent g5 dominated season #76 with retake-aware kill priority
// (score = enemy - 0.5 * worst_backup_enemy). Two refinements that
// the worst-single-tile metric misses on lab1's 30x22 wrap:
//
//  1. Multi-backup convergence. If a target has TWO enemy backups on
//     different cardinal sides, both can retake next tick — but g5
//     only counts the larger one and underweights the threat.
//  2. Our own adjacent support. If we already have a friendly army
//     on one of the target's other neighbors, that army will move
//     in / reinforce the captured tile and the kill sticks even
//     against a chunky backup. g5 ignores friendly support entirely.
//
// Replace `worst_backup_enemy` with a *net* retake threat: sum across
// the target's other cardinal neighbors of max(0, enemy - friendly).
// This both aggregates converging backups and credits friendly
// support that would consolidate the capture. Per-tile clip at zero
// avoids one big friendly stack canceling out a real threat from a
// different direction (you can't be in two places at once next tick).
//
// Coefficient raised from 0.5 to 0.6 because aggregated threat is a
// truer signal than the worst-single-tile proxy and deserves slightly
// more weight against raw enemy size; we still strongly prefer big
// kills (Membrane-pressure logic from g4 is intact).
//
// Tech unchanged from g5 — the move-heavy 90/0/2/4/4 reserve thesis
// is what makes minimum-overkill kills affordable in the first place,
// and the GA optimum on lab1 hasn't moved.
export default {
  name: "Conqueror_g6_5a4345",
  author: "claude",
  version: 1,
  description: "g5 with net retake threat (aggregated enemies minus friendly support) replacing worst-single-backup.",
  summary: `g5's enemy - 0.5 * worst_backup_enemy fixed the
gross blindspot from g4 but is still myopic: it only credits the
single largest enemy backup tile, missing multi-backup
convergence, and it pretends our own adjacent armies don't exist
so it underweights stable kills where friendly support is in
position. g6 swaps in net retake threat = sum_{other neighbors}
max(0, enemy - friendly), so two converging enemies stack their
threat and a nearby friendly cancels it. Bias raised 0.5 -> 0.6
because the new metric is less noisy and deserves a slightly
stronger pull against pyrrhic captures. Overkill stays minimum
and tech stays 90/0/2/4/4 — the reserve thesis is what makes
this whole kill-priority refinement series pay off.`,
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
      const needed = enemy / BONUS + 0.6;
      if (needed > sLimit) continue;

      // Net retake threat across the target's *other* cardinal
      // neighbors. Per-tile clip at zero so a fat friendly on one
      // side can't mask a real enemy on another (next-tick movement
      // can only resolve one direction at a time).
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

      const score = enemy - 0.6 * netThreat;
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
