// Randomized-tiebreak Conqueror. Same alignment-score logic as the
// base Conqueror, but the direction-iteration order is shuffled per
// call using game.rng(). This makes ties between equally-aligned
// directions break uniformly at random instead of always favoring W.
//
// Used to test whether the slot asymmetry observed in mirror matches
// is caused by Conqueror's W-cardinal preference combined with stable
// JS sort, or by something else (e.g. player iteration order in
// Game.step).

import { sumStrength } from "../../src/core/Army.js";

const BONUS = 1.4;

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
  name: "Conqueror_rand",
  author: "exp",
  version: 1,
  description: "Conqueror with random tiebreak among equally-aligned directions.",
  act(army, game) {
    const tile = army.tile;
    if (!tile || !tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    // Fisher-Yates shuffle of [0,1,2,3] using game.rng(). The shuffle
    // changes the insertion order into `ranked`, so stable sort breaks
    // score-ties in the shuffled order instead of W-first.
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = (game.rng() * (i + 1)) | 0;
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }

    const ranked = [];
    for (let oi = 0; oi < 4; oi++) {
      const k = order[oi];
      if (!neighbors[k]) continue;
      const offs = OFFSETS[k];
      let score = 0;
      for (let n = 0; n < offs.length; n += 2) {
        const t = stencil[offs[n]];
        if (!t) continue;
        score += offs[n + 1] * sumStrength(t.armies, viewer);
      }
      ranked.push([score, k]);
    }
    ranked.sort((a, b) => b[0] - a[0]);

    for (let r = 0; r < ranked.length; r++) {
      const dir = ranked[r][1];
      const target = neighbors[dir];
      const armies = target.armies;

      let friendlyArmy = null;
      let enemy = 0;
      for (let i = 0; i < armies.length; i++) {
        const a = armies[i];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }

      if (friendlyArmy) {
        const cap = friendlyArmy.maxStrength;
        if (friendlyArmy.strength >= cap - 0.5) continue;
        const room = cap - friendlyArmy.strength;
        const want = (army.strength - friendlyArmy.strength) / 2;
        const power = Math.min(sLimit, room, Math.max(0.6, want));
        if (power > 0.5) {
          army.attack(target, power);
          return;
        }
        continue;
      }

      if (enemy > 0) {
        const needed = enemy / BONUS + 0.6;
        if (needed > sLimit) continue;
        army.attack(target, needed);
        return;
      }

      army.attack(target, sLimit);
      return;
    }
  },
};
