export default {
  name: "Scout",
  author: "core",
  version: 1,
  description: "Sprays thin probes into empty tiles, hoarding the rest at home.",
  summary: `Land-grab. We commit a flat 1.2 strength into any empty neighbor —
just enough to clear the attack-validity floor and plant a flag —
and otherwise hit the weakest enemy with enemyTotal + 1.5 if
affordable. Everything else stays home and grows. Thesis: territory
is the scoring currency, and an empty tile claimed for 1.2 strength
is the cheapest possible point. Most ticks we don't act because we
already touch all our neighbors; on the rare tick a frontier opens
up we sprint into it. Easy to bully — those 1.2-strength outposts
die to a single Aggressive — but in the early game the territory
swing is enormous.`,
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
