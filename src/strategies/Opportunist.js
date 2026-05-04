import { totalStrength } from "../core/Army.js";

export default {
  name: "Opportunist",
  author: "core",
  version: 1,
  description: "Only takes free or weakly-held tiles; sits tight when surrounded by strong enemies.",
  act(army) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    let best = null;
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
      if (friendly) continue;
      if (enemy * 2 + 1 >= army.strength) continue;
      if (enemy < bestEnemy) {
        bestEnemy = enemy;
        best = t;
      }
    }
    if (best) army.attack(best, army.strength - 1);
  },
};
