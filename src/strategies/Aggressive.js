import SlowAndSteady from "./SlowAndSteady.js";

export default {
  name: "Aggressive",
  author: "core",
  version: 1,
  description: "Picks the strongest enemy it can still beat; otherwise plays SlowAndSteady.",
  summary: `Greedy on contact. When at least one neighbor has enemies, pick
the *strongest* enemy stack we can still beat with margin (their total <
our strength - 1) and commit strength - 1 into it. The intuition: SlowAndSteady
will happily punch the weakest enemy first, but the weakest enemy is
usually irrelevant — taking out the biggest threat we can afford to take
out swings the board harder. With no enemies adjacent, we fall back to
SlowAndSteady so we don't sit idle in our own backfield. Weakness: the
"can I beat them with margin 1" check is local and ignores enemy
reinforcements arriving the same tick, so this bot occasionally walks
into trades it expected to win.`,
  act(army, game) {
    const neighbors = army.tile ? army.tile.neighbors : null;
    const pid = army.player.id;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 4; i++) {
      const t = neighbors ? neighbors[i] : game.map.adjacent(army.pos, i);
      if (!t) continue;
      const armies = t.armies;
      let enemyTotal = 0;
      let hasEnemy = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id !== pid) {
          enemyTotal += a.strength;
          hasEnemy = true;
        }
      }
      if (!hasEnemy) continue;
      if (enemyTotal > bestScore && enemyTotal < army.attackPower) {
        bestScore = enemyTotal;
        best = t;
      }
    }
    if (best) army.attack(best, army.attackPower);
    else SlowAndSteady.act(army, game);
  },
};
