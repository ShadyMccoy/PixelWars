// Descendant of Trinity. One tiny change: instead of shoving the entire
// (strength - 1) every tick, hold back 5%. The thesis is that Trinity's
// pure-shove behavior over-commits when the kernel score is dominated
// by a single distant friendly — keeping a sliver makes the home tile
// less brittle to a counter-strike on the same tick, at a small cost to
// the forward push.

import { sumStrength } from "../core/Army.js";

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

const COMMIT_FRAC = 0.95;

export default {
  name: "Trinity_g1_3786cc",
  author: "spawn-agent",
  version: 1,
  description: "Trinity variant: holds back 5% of attack power per push.",
  summary: `Descendant of Trinity. Same kernel-driven directional choice;
the only change is reserving 5% of (strength - 1) on the home tile each
tick instead of committing it all forward. Net effect: marginally
slower push, slightly more resilient defense.`,
  act(army) {
    const tile = army.tile;
    if (!tile) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    let bestDir = 0;
    let bestScore = -Infinity;
    for (let k = 0; k < 4; k++) {
      const offs = OFFSETS[k];
      let score = 0;
      for (let n = 0; n < offs.length; n += 2) {
        const t = stencil[offs[n]];
        if (!t) continue;
        score += offs[n + 1] * sumStrength(t.armies, viewer);
      }
      if (score > bestScore) {
        bestScore = score;
        bestDir = k;
      }
    }
    const target = tile.neighbors[bestDir];
    if (target) army.attack(target, army.attackPower * COMMIT_FRAC);
  },
};
