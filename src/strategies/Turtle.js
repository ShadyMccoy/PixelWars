export default {
  name: "Turtle",
  author: "core",
  version: 1,
  description: "Hoards strength. Only attacks at full cap, and only into empty tiles.",
  summary: `Maximum patience. We refuse to spill a single drop of strength
until the army is at maxStrength, and even then we only walk into
genuinely empty neighbors — never into a fight, never into a friendly.
The thesis is that contested attacks are roughly even-money and the
expected value of doing nothing is positive (passive growth), so any
bot that won't fight us strictly loses ground over time. Predictably
useless on the small-and-crowded arena map where there are no empty
neighbors to walk into; surprisingly competent on royale where the
map is large and the early-game has plenty of room to peacefully
fatten.`,
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
