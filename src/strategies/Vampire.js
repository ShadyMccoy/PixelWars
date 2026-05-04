export default {
  name: "Vampire",
  author: "core",
  version: 1,
  description: "Hits the weakest enemy with the smallest force needed to kill them, growing fat over time.",
  act(army) {
    const neighbors = army.tile ? army.tile.neighbors : null;
    if (!neighbors) return;
    const pid = army.player.id;
    let bestTile = null;
    let bestEnemy = Infinity;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendly = true;
        else enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      if (enemy + 1.1 > army.strength) continue;
      if (enemy < bestEnemy) {
        bestEnemy = enemy;
        bestTile = t;
      }
    }
    if (bestTile) army.attack(bestTile, bestEnemy + 1);
  },
};
