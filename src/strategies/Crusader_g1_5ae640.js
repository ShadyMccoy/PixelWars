import Trinity from "./Trinity.js";

const ATTACKER_BONUS = 1.4;
const KILL_MARGIN = 1.05;

// Crusader variant: require a 5% margin over enemy strength before
// committing to the kill. Crusader's thesis is "target the strongest
// winnable enemy" but with an exact `myEff > enemy` check, the
// borderline kills leave the captured tile at near-zero residual
// strength (with attacker bonus 1.4, residual ≈ mine - enemy*0.714,
// so kills at mine ≈ enemy/1.4 leave ~0 leftover). Those tiles are
// immediately recapturable. Requiring 5% margin trades a thin band
// of marginal kills for sturdier follow-up positions. Trinity
// fallback is unchanged, so the bot still acts every tick.
export default {
  name: "Crusader_g1_5ae640",
  author: "claude",
  version: 1,
  description: "Crusader variant: require a 5% margin (myEff > enemy * 1.05) before committing to a kill.",
  summary: `Same Crusader-then-Trinity flow. Only change: the kill
predicate is myEff > enemy * 1.05 instead of myEff > enemy. This
skips razor-thin kills that leave the captured tile at near-zero
residual strength (and therefore immediately recapturable), at the
cost of giving up a small band of marginal kills. Expected to
slightly improve Crusader's late-match staying power without
changing its early-game behavior.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const myEff = (army.attackPower) * ATTACKER_BONUS;
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
      if (myEff <= enemy * KILL_MARGIN) continue;
      if (enemy > bestEnemyStr) {
        bestEnemyStr = enemy;
        bestKill = t;
      }
    }
    if (bestKill) {
      army.attack(bestKill, army.attackPower);
      return;
    }
    Trinity.act(army, game);
  },
};
