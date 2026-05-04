export default {
  name: "Avalanche",
  author: "core",
  version: 1,
  description: "Sits at the cap, then dumps every drop into the strongest beatable enemy.",
  act(army) {
    if (army.strength < army.maxStrength - 0.05) return;
    const neighbors = army.tile ? army.tile.neighbors : null;
    if (!neighbors) return;
    const pid = army.player.id;
    let bestEnemy = null;
    let bestEnemyScore = -Infinity;
    let firstEmpty = null;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) {
        if (!firstEmpty) firstEmpty = t;
        continue;
      }
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendly = true;
        else enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      if (enemy + 1 >= army.strength) continue;
      if (enemy > bestEnemyScore) {
        bestEnemyScore = enemy;
        bestEnemy = t;
      }
    }
    if (bestEnemy) {
      army.attack(bestEnemy, army.strength - 1);
      return;
    }
    if (firstEmpty) army.attack(firstEmpty, army.strength - 1);
  },
};
