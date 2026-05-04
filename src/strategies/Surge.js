import SlowAndSteady from "./SlowAndSteady.js";

const ATTACKER_BONUS = 1.4;

export default {
  name: "Surge",
  author: "shady",
  version: 1,
  description: "Below 50% strength plays SlowAndSteady; above, dumps everything into the strongest beatable enemy.",
  summary: `Two-mode bot. While weak (<50% maxStrength) we play SlowAndSteady,
nibbling outward without overcommitting; this means we never sit
idle in the early game when neighbors are racing for empty land.
Once we cross 50% we switch to "Surge mode": scan neighbors, pick
the STRONGEST beatable enemy (effective strength s-1 multiplied by
the engine's 1.4 attacker bonus), and shove all-in. With no
beatable enemy adjacent we expand into the first empty tile, or
fall through to SlowAndSteady.

Compared to Avalanche (which holds until ~95% then dumps), Surge
fires roughly twice as often: 50% threshold means each army gets
to "land a kill" every ~4 ticks instead of every ~10. The early
SlowAndSteady mode also patches Avalanche's main weakness — losing
territory while waiting to recharge.`,
  act(army, game) {
    if (army.strength < army.maxStrength * 0.5) {
      SlowAndSteady.act(army, game);
      return;
    }
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const myEff = (army.strength - 1) * ATTACKER_BONUS;

    let bestKill = null;
    let bestKillStr = -1;
    let firstEmpty = null;

    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) {
        if (!firstEmpty) firstEmpty = t;
        continue;
      }
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      if (myEff <= enemy) continue;
      if (enemy > bestKillStr) {
        bestKillStr = enemy;
        bestKill = t;
      }
    }
    if (bestKill) {
      army.attack(bestKill, army.strength - 1);
      return;
    }
    if (firstEmpty) {
      army.attack(firstEmpty, army.strength - 1);
      return;
    }
    SlowAndSteady.act(army, game);
  },
};
