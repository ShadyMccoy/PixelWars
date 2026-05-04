import SlowAndSteady from "./SlowAndSteady.js";

export default {
  name: "Phalanx",
  author: "core",
  version: 1,
  description: "Refuses to move unless flanked by a friendly tile; then plays SlowAndSteady.",
  act(army, game) {
    const neighbors = army.tile ? army.tile.neighbors : null;
    if (!neighbors) return;
    const pid = army.player.id;
    let friendlies = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      for (let k = 0; k < armies.length; k++) {
        if (armies[k].player.id === pid) {
          friendlies++;
          break;
        }
      }
    }
    if (friendlies === 0) return;
    SlowAndSteady.act(army, game);
  },
};
