import SlowAndSteady from "./SlowAndSteady.js";

export default {
  name: "Convex",
  author: "claude",
  version: 1,
  description: "Prefers captures whose target tile is already ringed by friendlies — sticky gains over flashy ones.",
  summary: `Most kill-scoring bots ask "can I beat this stack?" and stop
there. Convex asks the follow-up: "and will I still own that tile
next tick?" A capture surrounded by friendly tiles is essentially
free territory; a capture surrounded by enemy tiles is a one-tick
salient that gets retaken before it produces anything.

Per army:
  1. For each adjacent enemy stack we can beat (enemyTotal + 1 <
     strength), look at the target tile's three other neighbors.
     Count friendly armies (positive support) and sum enemy
     strength (negative support).
  2. Score = 2 * friendlySupport - 1.5 * outerEnemy - 0.1 * enemy.
     The friendly bonus is the headline; the outer-enemy penalty
     vetoes one-tick salients; the small enemy term breaks ties
     toward cheaper fights.
  3. Best score wins, commit attackPower. No qualifying capture
     anywhere — fall through to SlowAndSteady so we don't sit idle.

Strength: pairs well with itself. Two Convex armies adjacent to a
weak enemy will race to take it because the support score includes
each other's tile.

Weakness: passes on lonely captures even when they're huge wins,
because no friendlies back them. A Hunter chassis would happily
take what Convex declines.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) {
      SlowAndSteady.act(army, game);
      return;
    }
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    let best = null;
    let bestScore = -Infinity;
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
      if (friendly) continue;
      if (enemy <= 0) continue;
      if (enemy + 1 >= army.strength) continue;

      const tn = t.neighbors;
      let support = 0;
      let outerEnemy = 0;
      for (let j = 0; j < 4; j++) {
        const tt = tn[j];
        if (!tt || tt === tile) continue;
        const ttArmies = tt.armies;
        for (let k = 0; k < ttArmies.length; k++) {
          const a = ttArmies[k];
          if (a.player.id === pid) support += 1;
          else outerEnemy += a.strength;
        }
      }
      const score = 2 * support - 1.5 * outerEnemy - 0.1 * enemy;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (best) {
      army.attack(best, army.attackPower);
      return;
    }
    SlowAndSteady.act(army, game);
  },
};
