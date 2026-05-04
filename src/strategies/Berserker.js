export default {
  name: "Berserker",
  author: "core",
  version: 1,
  description: "Throws everything in a random direction every tick.",
  summary: `Random's louder cousin. Same chaotic direction pick, but always
commits strength - 1 instead of a random force. Thesis: in early-game
chaos, decisively dumping mass somewhere — anywhere — beats hesitating,
because thin armies are food. Performs surprisingly well against
Cautious and Defender, which need contact to convert their advantages,
and predictably gets dismantled by Trinity once Trinity's lines form.`,
  act(army, game) {
    if (army.strength < 2) return;
    const dir = (game.rng() * 4) | 0;
    const tile = army.tile ? army.tile.neighbors[dir] : game.map.adjacent(army.pos, dir);
    if (!tile) return;
    army.attack(tile, army.strength - 1);
  },
};
