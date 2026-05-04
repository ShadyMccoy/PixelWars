import { sumStrength, totalStrength } from "../core/Army.js";
import SlowAndSteady from "./SlowAndSteady.js";

// Trinity's three-in-a-row friendly-alignment kernels.
const KERNELS = [
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
];
const OFFSETS = KERNELS.map((k) => {
  const out = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const w = k[i][j];
      if (w !== 0) out.push(i * 5 + j, w);
    }
  }
  return out;
});

export default {
  name: "Conductor",
  author: "claude",
  version: 1,
  description: "Trinity's flocking, but skips capped-friendly directions and never feeds unbeatable enemies.",
  summary: `Trinity wastes strength two ways: pushing strength - 1 into a
friendly tile that is already at cap (overflow is lost), and pushing
strength - 1 into an enemy stack we can't beat (the attack just
evaporates). Conductor scores Trinity's four candidate directions and
walks them in best-first order, picking the first one that is not a
trap:

- Friendly target at cap with no headroom: skip — would waste the
  shipment.
- Enemy target that is unbeatable (their total + 1 >= our strength):
  skip — would feed the enemy.
- Anything else: commit. Friendly with headroom gets just enough to
  cap them; empty gets strength - 1; beatable enemy gets strength - 1
  for a clean conquest.

If every Trinity direction is a trap, fall back to SlowAndSteady so we
still make progress against the weakest neighbor. Net: same emergent
formation as Trinity, but without leaking strength on capped allies or
unwinnable enemies.`,
  act(army, game) {
    if (army.strength < 1.5) {
      SlowAndSteady.act(army, game);
      return;
    }
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const stencil = tile.stencil5;
    if (!stencil) return;

    const viewer = army.player;
    const scores = [-Infinity, -Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 4; k++) {
      if (!neighbors[k]) continue;
      const offs = OFFSETS[k];
      let s = 0;
      for (let n = 0; n < offs.length; n += 2) {
        const t = stencil[offs[n]];
        if (!t) continue;
        s += offs[n + 1] * sumStrength(t.armies, viewer);
      }
      scores[k] = s;
    }

    // Try directions in best-first order; first non-trap wins.
    const order = [0, 1, 2, 3].sort((a, b) => scores[b] - scores[a]);
    const pid = army.player.id;
    for (let oi = 0; oi < 4; oi++) {
      const dir = order[oi];
      if (scores[dir] === -Infinity) break;
      const target = neighbors[dir];
      if (!target) continue;
      const armies = target.armies;
      let friendStr = 0;
      let friendCap = 0;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) {
          friendStr += a.strength;
          friendCap = a.maxStrength;
        } else {
          enemy += a.strength;
        }
      }
      if (friendStr > 0 && enemy === 0) {
        const headroom = friendCap - friendStr;
        if (headroom < 0.6) continue; // friend at cap — would waste.
        const power = Math.min(army.strength - 1, headroom);
        if (power > 0.5) {
          army.attack(target, power);
          return;
        }
        continue;
      }
      if (enemy === 0) {
        // Empty.
        army.attack(target, army.strength - 1);
        return;
      }
      // Enemy at target — commit if winnable, factoring the engine's
      // 1.4x attacker bonus.
      const myEff = (army.strength - 1) * 1.4;
      if (myEff > enemy) {
        army.attack(target, army.strength - 1);
        return;
      }
      // Unbeatable; try next direction.
    }
    // Every Trinity-preferred direction is a trap (capped friend or
    // unbeatable enemy). Fall back to a careful probe.
    SlowAndSteady.act(army, game);
  },
};
