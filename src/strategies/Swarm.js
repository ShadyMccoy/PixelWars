export default {
  name: "Swarm",
  author: "core",
  version: 1,
  description: "Sends small probes toward weak enemies, preferring lonely tiles.",
  act(army, game) {
    const neighbors = army.tile ? army.tile.neighbors : null;
    const pid = army.player.id;
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < 4; i++) {
      const t = neighbors ? neighbors[i] : game.map.adjacent(army.pos, i);
      if (!t) continue;
      const armies = t.armies;
      let friendly = 0;
      let enemyS = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendly++;
        else enemyS += a.strength;
      }
      const score = enemyS - friendly * 0.5;
      if (score < bestScore && enemyS < army.strength - 0.5) {
        bestScore = score;
        best = t;
      }
    }
    if (best) army.attack(best, Math.min(army.strength - 1, army.strength * 0.4 + 0.5));
  },
};
