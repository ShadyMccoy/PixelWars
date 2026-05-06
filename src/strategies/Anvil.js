import { balanceAttack } from "./helpers.js";

const BONUS = 1.4;

export default {
  name: "Anvil",
  author: "shady",
  version: 1,
  description: "Holds at full strength, smashes adjacent enemies on contact, expands only when capped.",
  summary: `Pure counter-puncher. The default action is "do nothing"; we let the
production engine refill us toward maxStrength and we wait. Two things
will pull us off station:

  - A beatable adjacent enemy. We scan neighbors for the strongest stack
    we can still kill with the 1.4x attacker bonus and all-in on it
    (pick the strongest, not the weakest — taking out a fat threat
    swings the board far harder than chipping the smallest target).
  - A capped tile with an empty neighbor. Once we are at full strength
    further regrowth is wasted, so we let SlowAndSteady-style balance
    bleed the surplus into the empty tile.

We never expand into empty tiles while under-cap, and we never trade
into an enemy we cannot decisively beat. The thesis: a wall of full-
strength tiles is structurally durable — every attack on us is a fight
the attacker has to win cleanly, and most aggressors will pick on
softer targets first. Tech is heavy def + heavy stack to amplify the
"I am a wall" effect; bots that punch through anyway tend to take
catastrophic damage doing so.

Known weakness: any opponent that can grow faster than us in a corner
will out-economy us, since we forfeit free expansion until we are
already full. Pairs poorly with itself for the same reason — two
Anvils in opposite corners both stall.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
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

    // Only spend regrowth into empty tiles once we're already topped up.
    if (army.strength >= army.maxStrength - 0.5) {
      const fallback = army.weakestAdjacent();
      if (!fallback) return;
      // Restrict to truly empty tiles — never bleed into a contested fight
      // we wouldn't have taken above.
      if (fallback.armies.length === 0) {
        balanceAttack(army, fallback);
      }
    }
  },
};
