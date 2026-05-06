import Trinity from "./Trinity.js";

const ATTACKER_BONUS = 1.4;

// Crusader variant: target the WEAKEST winnable enemy instead of the
// strongest. The original Crusader thesis is "kill strongest to defang
// local threats." But Stalker (lab3 RR champion) and the engine's
// 1.4x attacker bonus both favor weakest-prey targeting: thin kills
// leave the captured tile at near-zero residual strength while clean
// kills (mine >> enemy) leave the tile defensible. Sibling g1_5ae640
// added a 5% kill margin without reordering targets - that was
// neutral. This descendant inverts the order entirely: among
// winnable enemies, attack the easiest one. Single-comparison flip.
export default {
  name: "Crusader_g1_5f8b45",
  author: "claude",
  version: 1,
  description: "Crusader variant: target the weakest winnable enemy instead of the strongest.",
  summary: `Same Crusader-then-Trinity flow. Only change: among
winnable adjacent enemies, pick the weakest one (cleanest kill)
instead of the strongest (most defanging). The flip from > to <
in the inner-loop tiebreaker is the entire diff. Tests whether
weakest-prey is actually the right heuristic for Crusader the same
way it is for Stalker.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const myEff = (army.attackPower) * ATTACKER_BONUS;
    let bestKill = null;
    let bestEnemyStr = Infinity;
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
      if (enemy < bestEnemyStr) {
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
