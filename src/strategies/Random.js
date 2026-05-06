export default {
  name: "Random",
  author: "core",
  version: 1,
  description: "Random direction, random force. Pure chaos.",
  summary: `Control bot. The point of Random is to be the noise floor — any
strategy that can't reliably outscore Random is doing something
actively wrong. Uses game.rng() rather than Math.random() so tournament
runs replay deterministically.`,
  act(army, game) {
    const dir = (game.rng() * 4) | 0;
    const tile = army.tile ? army.tile.neighbors[dir] : game.map.adjacent(army.pos, dir);
    if (!tile) return;
    army.attack(tile, game.rng() * (army.attackPower));
  },
};
