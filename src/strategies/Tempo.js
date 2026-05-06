import SlowAndSteady from "./SlowAndSteady.js";

const BONUS = 1.4;
const PERIOD = 30;

export default {
  name: "Tempo",
  author: "shady",
  version: 1,
  description: "Alternates global stockpile and blitz phases on a fixed cadence.",
  summary: `War in two beats. For PERIOD ticks we play SlowAndSteady — controlled
balanced expansion, never bleed strength on a marginal attack. For the
next PERIOD ticks we play full-aggression Crusader: any beatable
adjacent enemy gets an all-in punch with the 1.4x attacker bonus, and
we fall back to SlowAndSteady only when no kill is available.

Phases are global on game.tick, so every Tempo army of the same player
transitions at the same moment, creating a coordinated wave that's
hard to read in advance. The thesis: bots that play one tempo forever
are predictable and counterable. Defender-style hold-everything bots
get rewarded against pure aggressors and crushed by snowballers; pure
aggressors get rewarded against turtles and crushed by Anvil-class
counter-punchers. Alternating phases force the opponent to brace
against an attack that may not come, then absorb a wave that arrives
all at once.

Tech leans into the alternation — heavy stack during stockpile builds
the ammunition that the heavy atk during blitz then spends. Known
weakness: a bot whose internal cycle aligns with ours (mirror Tempo,
or accidental resonance with another bot's BFS depth) sees both
phases happen "at the wrong time" and trades poorly.`,
  act(army, game) {
    const phase = Math.floor(game.tick / PERIOD) % 2;
    if (phase === 0) {
      SlowAndSteady.act(army, game);
      return;
    }

    const tile = army.tile;
    if (!tile) {
      SlowAndSteady.act(army, game);
      return;
    }
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const myEff = army.attackPower * BONUS;

    let bestKill = null;
    let bestKillStr = -1;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      if (myEff <= enemy) continue;
      if (enemy > bestKillStr) { bestKillStr = enemy; bestKill = t; }
    }

    if (bestKill) {
      army.attack(bestKill, army.attackPower);
      return;
    }
    SlowAndSteady.act(army, game);
  },
};
