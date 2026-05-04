import SlowAndSteady from "./SlowAndSteady.js";

export default {
  name: "Aggressive",
  author: "core",
  version: 1,
  description: "Picks the strongest enemy it can still beat; otherwise plays SlowAndSteady.",
  act(army, game) {
    const neighbors = army.tile ? army.tile.neighbors : null;
    const pid = army.player.id;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 4; i++) {
      const t = neighbors ? neighbors[i] : game.map.adjacent(army.pos, i);
      if (!t) continue;
      const armies = t.armies;
      let enemyTotal = 0;
      let hasEnemy = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id !== pid) {
          enemyTotal += a.strength;
          hasEnemy = true;
        }
      }
      if (!hasEnemy) continue;
      if (enemyTotal > bestScore && enemyTotal < army.strength - 1) {
        bestScore = enemyTotal;
        best = t;
      }
    }
    if (best) army.attack(best, army.strength - 1);
    else SlowAndSteady.act(army, game);
  },
};
