import SlowAndSteady from "./SlowAndSteady.js";

export default {
  name: "Coward",
  author: "claude",
  version: 1,
  description: "Retreats into the friendliest neighbor with the most room whenever a stronger enemy is adjacent; otherwise plays SlowAndSteady.",
  summary: `Survive first, fight second. Most bots in the pool — Aggressive,
Berserker, Hunter — cheerfully commit strength - 1 into a fight as soon as
the local arithmetic looks winnable. That arithmetic ignores future ticks:
an overcommitting attacker often leaves a 1-strength remnant adjacent to
a tile that just absorbed a friendly stack, and Coward eats those for free
on the next tick.

Mechanism: scan the four neighbors. If any single enemy stack on a
neighbor exceeds our own strength, we treat ourselves as threatened.
Find the friendly neighbor with the most remaining room (maxStrength -
strength) and pour ourselves into it — combining with the friendly
trades a vulnerable thin army for a single fatter army on a tile that
already had backup. If we can't find a retreat (no friendly with room,
or no threat), fall back to SlowAndSteady so we don't sit useless.

Weakness: Coward is poor at scoring kills. It wins games by outlasting
the chaotic phase, not by capturing tiles; on maps with few neighbors
or against opponents that don't overcommit (Trinity, Defender) it
underperforms because the retreat trigger rarely fires and the fallback
is just baseline. Strong against Berserker, Hunter pairs, and any bot
that thins itself going forward.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    let strongestEnemyAdj = 0;
    let bestRetreat = null;
    let bestRoom = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let enemyHere = 0;
      let friendlyHere = null;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyHere = a;
        else enemyHere += a.strength;
      }
      if (enemyHere > strongestEnemyAdj) strongestEnemyAdj = enemyHere;
      if (friendlyHere) {
        const room = friendlyHere.maxStrength - friendlyHere.strength;
        if (room > bestRoom) {
          bestRoom = room;
          bestRetreat = t;
        }
      }
    }
    if (strongestEnemyAdj > army.strength && bestRetreat && bestRoom > 0.5) {
      const send = Math.min(army.attackPower, bestRoom);
      if (send > 0.5) {
        army.attack(bestRetreat, send);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
