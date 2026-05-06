export default {
  name: "Avalanche",
  author: "core",
  version: 1,
  description: "Sits at the cap, then dumps every drop into the strongest beatable enemy.",
  summary: `Cautious + Aggressive bolted together. We do nothing until full
strength, then shove strength - 1 into the strongest enemy we can
still beat (preferring beefy targets the same way Aggressive does).
With no enemies adjacent we walk into an empty tile instead, so we
don't sit at cap doing nothing forever. Thesis: the conversion ratio
of strength-into-territory is best when each commitment is a clean
kill, and the only way to guarantee a clean kill against a fat enemy
is to be fatter. Tradeoff is obvious — between dumps we take ages to
recharge, and during that time neighbors are free to maneuver around
us.`,
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
      army.attack(bestEnemy, army.attackPower);
      return;
    }
    if (firstEmpty) army.attack(firstEmpty, army.attackPower);
  },
};
