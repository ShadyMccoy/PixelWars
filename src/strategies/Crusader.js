import Trinity from "./Trinity.js";

const ATTACKER_BONUS = 1.4;

export default {
  name: "Crusader",
  author: "shady",
  version: 1,
  description: "Kills any beatable adjacent enemy (factoring attacker bonus); otherwise flocks like Trinity.",
  summary: `Trinity is dominant because it always commits full strength and
flocks toward friendly mass — but it ignores enemy stacks unless they
happen to lie along a friendly alignment axis. Crusader patches that
hole. Each tick we first scan the four neighbors for enemies. If we
can beat the strongest one (using effective strength = (s-1) * 1.4
because attackers get the engine's attacker bonus), we shove all-in
and take the kill — converting a clean attacker-bonus victory into
territory. With no winnable enemies adjacent we fall through to
Trinity, so we never sit idle. The thesis: Trinity's only weakness
is missed kills next door, and the attacker bonus makes more kills
"winnable" than Aggressive's naive (enemy < s - 1) check assumes.
By targeting the STRONGEST winnable enemy we also defang local
threats before they grow.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const myEff = (army.strength - 1) * ATTACKER_BONUS;
    let bestKill = null;
    let bestEnemyStr = -1;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      if (myEff <= enemy) continue;
      if (enemy > bestEnemyStr) {
        bestEnemyStr = enemy;
        bestKill = t;
      }
    }
    if (bestKill) {
      army.attack(bestKill, army.strength - 1);
      return;
    }
    Trinity.act(army, game);
  },
};
