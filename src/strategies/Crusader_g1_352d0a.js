import Conqueror from "./Conqueror.js";

const ATTACKER_BONUS = 1.4;

// Crusader variant: replace the Trinity fallback with Conqueror.
// Original Crusader's only logic is "kill strongest winnable
// adjacent enemy, else play Trinity." Trinity flocks toward
// friendly mass - good when armies want to pool, bad when they
// dribble into already-full friendly stacks. Conqueror handles
// minimum-overkill kills, friendly-balance, and empty-grab,
// fitting the Crusader thesis (kill cleanly, take territory)
// better than Trinity's flocking. Same kill-selection: strongest
// winnable enemy adjacent, attack with full power.
export default {
  name: "Crusader_g1_352d0a",
  author: "claude",
  version: 1,
  description: "Crusader with Conqueror fallback instead of Trinity.",
  summary: `Standard Crusader kill phase: scan all 4 neighbors for
adjacent enemies, attack the strongest winnable one. Different
fallback: Conqueror (minimum-overkill kills, balance friendlies,
grab empty) instead of Trinity (flock toward friendly mass).
Conqueror's behavior on the no-kill path is closer to Crusader's
own thesis - take ground efficiently rather than pool with friends.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const myEff = (army.attackPower) * ATTACKER_BONUS;
    let bestKill = null;
    let bestEnemyStr = -1;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      if (myEff <= enemy) continue;
      if (enemy > bestEnemyStr) {
        bestEnemyStr = enemy;
        bestKill = t;
      }
    }
    if (bestKill) {
      army.attack(bestKill, army.attackPower);
      return;
    }
    Conqueror.act(army, game);
  },
};
