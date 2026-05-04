import SlowAndSteady from "./SlowAndSteady.js";
import Defender from "./Defender.js";
import Aggressive from "./Aggressive.js";

export default {
  name: "Adaptive",
  author: "core",
  version: 1,
  description: "Reads local enemy pressure and switches between Defender, SlowAndSteady, and Aggressive.",
  act(army, game) {
    const neighbors = army.tile ? army.tile.neighbors : null;
    if (!neighbors) return;
    const pid = army.player.id;
    let enemy = 0;
    let friendly = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendly += a.strength;
        else enemy += a.strength;
      }
    }
    if (enemy > army.strength * 1.5) {
      Defender.act(army, game);
      return;
    }
    if (friendly > enemy + army.strength * 0.5) {
      Aggressive.act(army, game);
      return;
    }
    SlowAndSteady.act(army, game);
  },
};
