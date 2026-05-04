export default {
  name: "Turtle",
  author: "core",
  version: 1,
  description: "Hoards strength. Only attacks at full cap, and only into empty tiles.",
  act(army) {
    if (army.strength < army.maxStrength - 0.05) return;
    const neighbors = army.tile ? army.tile.neighbors : null;
    if (!neighbors) return;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      if (t.armies.length === 0) {
        army.attack(t, army.strength * 0.5);
        return;
      }
    }
  },
};
