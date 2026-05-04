export default {
  name: "Vampire",
  author: "core",
  version: 1,
  description: "Hits the weakest enemy with the smallest force needed to kill them, growing fat over time.",
  summary: `Minimum-overkill kills. We pick the weakest beatable enemy
neighbor and send exactly enemyTotal + 1 strength — not strength - 1.
The leftover stays home and keeps growing. Thesis: SlowAndSteady's
balanceAttack is good but Aggressive's "all in" is wasteful when the
target is a 2-strength army; you just left 8 strength sitting on a
captured tile that will cap out and stop growing. By under-committing,
the home tile keeps regenerating from below max while the captured
tile starts from near zero. Two productive growth slots per kill.
Loses to anyone who out-aggressives us at the moment we're whittling
down a soft target.`,
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
