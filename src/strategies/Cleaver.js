import SlowAndSteady from "./SlowAndSteady.js";

export default {
  name: "Cleaver",
  author: "claude",
  version: 1,
  description: "Picks off the most isolated adjacent enemy — the one with the fewest friends nearby.",
  summary: `Convex's mirror twin. Where Convex scores by friendly
support around the target, Cleaver scores by *lack of enemy
support*. The intuition: an enemy stack with three more enemy
stacks adjacent to it is going to get reinforced even if we win
the capture, so the kill is wasted overhead. An enemy stack
isolated in our half of the board has nowhere to retreat to and
nothing to reinforce it — that's the one to kill.

Per army:
  1. For each adjacent enemy stack we can beat (enemyTotal + 1 <
     strength), look at the target tile's three other neighbors
     and sum enemy strength on those tiles (the "backup").
  2. Score = enemy - 1.2 * backup. Big enemy with low backup
     scores best; a fat enemy with three fat enemies behind it is
     scored the same as a small isolated enemy and we'd rather
     pick the small isolated one.
  3. If no qualifying kill, fall through to SlowAndSteady.

Strength: a natural counter to Phalanx-style "thick line" bots.
Cleaver bypasses the line center and chews on whichever flank
tile has the least backup, peeling the line apart over several
ticks.

Weakness: when the entire board is contested and every enemy has
backup, Cleaver's scorer ranks all candidates roughly equal and
behaves like a noisy SlowAndSteady. Doesn't shine until the
midgame when frontiers form.`,
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
      let backup = 0;
      for (let j = 0; j < 4; j++) {
        const tt = tn[j];
        if (!tt || tt === tile) continue;
        const ttArmies = tt.armies;
        for (let k = 0; k < ttArmies.length; k++) {
          const a = ttArmies[k];
          if (a.player.id !== pid) backup += a.strength;
        }
      }
      const score = enemy - 1.2 * backup;
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
