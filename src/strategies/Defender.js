import SlowAndSteady from "./SlowAndSteady.js";

export default {
  name: "Defender",
  author: "core",
  version: 1,
  description: "Reinforces the friendliest neighbor; expands only when nearly full.",
  summary: `Turtle. Each army looks at its four neighbors and counts how many
friendlies sit on each; whichever tile has the most friendlies gets half
our strength as reinforcement (provided we have at least 4 to spare).
The hypothesis is that PixelWars rewards thick stacks over wide thin
fronts — once a tile has 3+ friendly armies it is essentially
unbreakable to a single attacker. We only expand (via SlowAndSteady)
when over 85% of maxStrength, so most ticks we just thicken. This bot
loses to anyone who can starve us of contact, but it is very hard to
kill in a head-on brawl.`,
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
