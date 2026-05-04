export default {
  name: "Random",
  author: "core",
  version: 1,
  description: "Random direction, random force. Pure chaos.",
  act(army, game) {
    const dir = (game.rng() * 4) | 0;
    const tile = army.tile ? army.tile.neighbors[dir] : game.map.adjacent(army.pos, dir);
    if (!tile) return;
    army.attack(tile, game.rng() * (army.strength - 1));
  },
};
