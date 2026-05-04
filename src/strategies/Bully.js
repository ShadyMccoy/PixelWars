import SlowAndSteady from "./SlowAndSteady.js";

export default {
  name: "Bully",
  author: "core",
  version: 1,
  description: "Targets the current territory leader; ignores stragglers unless they're underfoot.",
  act(army, game) {
    const neighbors = army.tile ? army.tile.neighbors : null;
    if (!neighbors) {
      SlowAndSteady.act(army, game);
      return;
    }
    const pid = army.player.id;
    let leaderId = -1;
    let leaderTerr = -1;
    const players = game.players.list;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.id === pid) continue;
      const terr = p.totals ? p.totals.territory : 0;
      if (terr > leaderTerr) {
        leaderTerr = terr;
        leaderId = p.id;
      }
    }
    if (leaderId < 0) {
      SlowAndSteady.act(army, game);
      return;
    }
    let target = null;
    let bestEnemy = Infinity;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let leaderStr = 0;
      let hasLeader = false;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendly = true;
        else if (a.player.id === leaderId) {
          leaderStr += a.strength;
          hasLeader = true;
        }
      }
      if (friendly || !hasLeader) continue;
      if (leaderStr + 1 >= army.strength) continue;
      if (leaderStr < bestEnemy) {
        bestEnemy = leaderStr;
        target = t;
      }
    }
    if (target) army.attack(target, army.strength - 1);
    else SlowAndSteady.act(army, game);
  },
};
