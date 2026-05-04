export default {
  name: "Scout",
  author: "core",
  version: 1,
  description: "Sprays thin probes into empty tiles, hoarding the rest at home.",
  act(army) {
    if (army.strength < 2.5) return;
    const neighbors = army.tile ? army.tile.neighbors : null;
    if (!neighbors) return;
    let bestEmpty = null;
    let bestWeak = null;
    let weakStr = Infinity;
    const pid = army.player.id;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) {
        if (!bestEmpty) bestEmpty = t;
        continue;
      }
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendly = true;
        else enemy += a.strength;
      }
      if (friendly) continue;
      if (enemy < weakStr) {
        weakStr = enemy;
        bestWeak = t;
      }
    }
    if (bestEmpty) {
      army.attack(bestEmpty, 1.2);
      return;
    }
    if (bestWeak && weakStr + 1.5 < army.strength) {
      army.attack(bestWeak, weakStr + 1.5);
    }
  },
};
