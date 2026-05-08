import SlowAndSteady from "./SlowAndSteady.js";

export default {
  name: "Escort",
  author: "claude",
  version: 1,
  description: "Prefers attacking enemy tiles that already have a friendly army adjacent (so the captured tile lands with backup); otherwise plays SlowAndSteady.",
  summary: `Don't fight alone. Most kill-pickers in the lineage (Aggressive,
Conqueror, Hammer) score targets by enemy strength and local backing,
but the simplest version of "backing" is binary: does the target tile
have any friendly army adjacent that could reinforce or trade if a
counter-attack arrives next tick? Escort answers that question
directly without 5x5 stencil math.

Mechanism: scan adjacent enemy tiles we can beat (their total < our
strength - 1). For each candidate, look at its other neighbors — if
any contain a friendly army with non-trivial strength, the candidate
gets a "supported" flag. Among supported candidates, attack the
strongest beatable one. If no candidate is supported, take the
strongest beatable enemy anyway (don't pass up a free kill). If no
enemies are beatable, fall back to SlowAndSteady to handle empty
expansion and reinforce.

Why bother: under Lanchester, a captured tile lands with sqrt(W^2 -
L^2) raw strength. If the next tick brings an enemy counter, that
captured tile dies unless a friendly is adjacent to combine on the
following tick's resolution. Picking a target that already has a
friendly neighbor means the capture has an exit, not just an entry.

Cheap, self-contained, and behaves identically to Aggressive on the
margin where no friendlies are nearby — so Escort is at minimum
Aggressive-equivalent and meaningfully better when armies cluster
along a frontier.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    let bestSupported = null;
    let bestSupportedStr = -Infinity;
    let bestAny = null;
    let bestAnyStr = -Infinity;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let enemy = 0;
      let friendlyHere = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendlyHere = true; break; }
        enemy += a.strength;
      }
      if (friendlyHere || enemy <= 0) continue;
      if (enemy + 1 >= army.strength) continue;
      let supported = false;
      const tn = t.neighbors;
      for (let j = 0; j < 4; j++) {
        const tt = tn[j];
        if (!tt || tt === tile) continue;
        const ttArmies = tt.armies;
        for (let k = 0; k < ttArmies.length; k++) {
          const a = ttArmies[k];
          if (a.player.id === pid && a.strength > 1) { supported = true; break; }
        }
        if (supported) break;
      }
      if (supported && enemy > bestSupportedStr) {
        bestSupportedStr = enemy;
        bestSupported = t;
      }
      if (enemy > bestAnyStr) {
        bestAnyStr = enemy;
        bestAny = t;
      }
    }
    const target = bestSupported || bestAny;
    if (target) {
      army.attack(target, army.attackPower);
      return;
    }
    SlowAndSteady.act(army, game);
  },
};
