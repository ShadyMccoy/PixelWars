import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Mode-switcher built on top of Conqueror. Conqueror already does the
// right thing when we're at least at parity locally: minimum-overkill
// kills, friendly balance, take-empties. The thing it doesn't handle
// is when we're outnumbered — a full-strength enemy stack adjacent that
// we can't beat solo. In that situation we want to consolidate, not
// commit. Citadel adds exactly that gate.
export default {
  name: "Citadel",
  author: "claude",
  version: 1,
  description: "Conqueror that consolidates onto the strongest friendly when outnumbered.",
  summary: `Adaptive's switcher idea was right but its sub-bots all under-use
the engine's 1.4x bonus. Citadel is much simpler: by default play
Conqueror (which already handles kills, empties, and balanced
reinforcement). Override only when we are clearly outnumbered locally
(adjacent enemy mass > strength * 1.4 — the threshold beyond which an
attacker bonus can't save us): in that case bleed surplus into the
fattest friendly neighbor instead, building a stack that *can* fight.
The hypothesis is that Adaptive lost rank because Defender's hoard
mode hoards forever; Citadel only triggers consolidation while the
threat is live, then snaps back to Conqueror the next tick once the
neighborhood arithmetic shifts.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    let enemyAdj = 0;
    let fattestFriendly = null;
    let fattestStrength = -1;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) {
          if (a.strength > fattestStrength) {
            fattestStrength = a.strength;
            fattestFriendly = t;
          }
        } else {
          enemyAdj += a.strength;
        }
      }
    }

    // Outnumbered AND have a friendly to fall back on: stack up.
    if (enemyAdj > army.strength * BONUS && fattestFriendly && army.strength > 3) {
      const room = (fattestStrength >= 0 ? army.maxStrength - fattestStrength : army.maxStrength);
      if (room > 0.6) {
        const power = Math.min(army.attackPower, room);
        if (power > 0.5) {
          army.attack(fattestFriendly, power);
          return;
        }
      }
    }

    Conqueror.act(army, game);
  },
};
