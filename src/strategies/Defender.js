import SlowAndSteady from "./SlowAndSteady.js";

export default {
  name: "Defender",
  author: "core",
  version: 1,
  description: "Reinforces the friendliest neighbor; expands only when nearly full.",
  act(army, game) {
    const neighbors = army.tile ? army.tile.neighbors : null;
    const pid = army.player.id;
    let friendliest = null;
    let count = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors ? neighbors[i] : game.map.adjacent(army.pos, i);
      if (!t) continue;
      const armies = t.armies;
      let friendly = 0;
      for (let k = 0; k < armies.length; k++) {
        if (armies[k].player.id === pid) friendly++;
      }
      if (friendly > count) {
        count = friendly;
        friendliest = t;
      }
    }
    if (count > 0 && army.strength > 4) {
      army.attack(friendliest, army.strength * 0.5);
      return;
    }
    if (army.strength > army.maxStrength * 0.85) SlowAndSteady.act(army, game);
  },
};
