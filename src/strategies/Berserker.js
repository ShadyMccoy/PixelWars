export default {
  name: "Berserker",
  author: "core",
  version: 1,
  description: "Throws everything in a random direction every tick.",
  act(army, game) {
    if (army.strength < 2) return;
    const dir = (game.rng() * 4) | 0;
    const tile = army.tile ? army.tile.neighbors[dir] : game.map.adjacent(army.pos, dir);
    if (!tile) return;
    army.attack(tile, army.strength - 1);
  },
};
