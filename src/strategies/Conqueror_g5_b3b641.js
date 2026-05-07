import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const REACH_WEIGHT = 0.5;

// Parent Conqueror_g4_1f6790 added a "kill the strongest beatable
// adjacent enemy" pre-pass before Conqueror's alignment kernel, and
// dominated season #50 with no recorded losses. Exploration rather
// than bug-fixing here: keep the structure, refine the kill-priority
// rule.
//
// The parent scores candidates by enemy strength alone. But a 5-str
// enemy with three of MY armies in its reach is strictly worse for me
// than a 5-str enemy sitting in empty terrain - the first can dump
// force on multiple of my tiles next tick, the second only on me.
// Two of my armies of strength 3 each (total 6) in the enemy's reach
// adds 3.0 to the kill score under REACH_WEIGHT=0.5, enough to
// displace a slightly stronger but isolated enemy. Strength stays
// dominant (preserves the Membrane-pressure fix the parent argued
// for), reach acts as a meaningful positional tiebreaker.
//
// Self-strength shows up in every candidate's reach (we are adjacent
// to each candidate), so it contributes equally and cancels in the
// comparison. Only OTHER friendlies near the enemy differentiate -
// which is exactly the "this enemy threatens our cluster" signal we
// want.
//
// Tech 90/0/2/4/4 unchanged - the move-heavy GA optimum still holds.
export default {
  name: "Conqueror_g5_b3b641",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 with reach-weighted kill priority - prefers beatable enemies that threaten our cluster.",
  summary: `g4 picks the strongest beatable adjacent enemy. That's correct
against single-stack Membrane pressure, but treats positional context
as zero: a 5-strength enemy with three of my armies in reach is a
worse threat than an equally-strong enemy in empty terrain, since the
first can dump force on multiple of my tiles next tick. Re-rank by
enemy_strength + 0.5 * friendly_strength_in_enemy_neighbors. Strength
stays dominant (parent's Membrane-stall reasoning preserved); reach
acts as a tiebreaker and a small displacement force when two enemies
are close in strength but far apart in positional value. Self
strength is in every candidate's reach equally and cancels - only
OTHER friendlies move the needle. Tech 90/0/2/4/4 unchanged.`,
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
    let bestScore = -1;
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

      let friendlyReach = 0;
      const enbrs = t.neighbors;
      for (let n = 0; n < 4; n++) {
        const nt = enbrs[n];
        if (!nt) continue;
        const na = nt.armies;
        for (let k = 0; k < na.length; k++) {
          const a = na[k];
          if (a.player.id === pid) friendlyReach += a.strength;
        }
      }
      const score = enemy + REACH_WEIGHT * friendlyReach;
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
