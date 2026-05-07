import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Parent Conqueror_g4_1f6790 dominated season #45, but its kill
// priority has a known blindspot: it picks the *strongest beatable*
// adjacent enemy regardless of what's behind that tile. With
// minimum-overkill (enemy/1.4 + 0.6), the survivor that lands on
// the captured tile has ~0.6 strength * 1.4 ≈ 0.4 surviving — i.e.
// almost nothing. If the captured tile has a fat enemy stack on its
// other side, we just hand back the kill next tick and burn tempo.
//
// Refinement: among beatable cardinal neighbors, score by
//   score = enemy - 0.5 * worst_backup_enemy
// where worst_backup_enemy is the largest enemy stack on the target
// tile's *other* neighbors. We still prefer big kills (the
// Membrane-pressure logic the parent introduced) but we deprioritize
// kills that will obviously be retaken. We don't refuse pyrrhic kills
// outright — denying tempo is still worse than ceding a tile, and
// the parent already gates by attackPower — we just bias selection
// toward stable captures when multiple options exist.
//
// We don't increase overkill: the parent's 90/0/2/4/4 tech is built
// around mobile reserves, and inflating attack size would drain that
// reserve into doomed captures rather than keeping it for the next
// alignment-kernel commit.
//
// Tech unchanged from g4 (and ultimately the GA optimum on lab1).
export default {
  name: "Conqueror_g5_0b2647",
  author: "claude",
  version: 1,
  description: "g4 with retake-aware kill priority: prefer beatable enemies whose tile has weak backup.",
  summary: `g4's strongest-beatable rule fixed Conqueror's missed-
adjacent-kill bug, but it ignores what's behind the kill. With
minimum-overkill the survivor on the captured tile is ~0.4
strength, so a fat backup enemy retakes for free next tick — we
spent reserve, gained nothing, and burned a turn. The fix scores
candidates by enemy - 0.5 * worst_backup_enemy across their other
cardinal neighbors. Still strongly prefers big kills (parent's
Membrane logic) but breaks ties — and overrides ranking — toward
captures that actually stick. Overkill stays minimum so the
move-heavy 90/0/2/4/4 reserve thesis is intact.`,
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

      // worst enemy stack on the target's other cardinal neighbors —
      // i.e. who can retake the tile next tick.
      let backup = 0;
      const tn = t.neighbors;
      for (let j = 0; j < 4; j++) {
        const tt = tn[j];
        if (!tt || tt === tile) continue;
        const ttArmies = tt.armies;
        let tnE = 0;
        for (let k = 0; k < ttArmies.length; k++) {
          const a = ttArmies[k];
          if (a.player.id !== pid) tnE += a.strength;
        }
        if (tnE > backup) backup = tnE;
      }

      const score = enemy - 0.5 * backup;
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
