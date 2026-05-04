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

// Precompute (stencilIdx, weight) tuples per kernel, dropping zero entries.
// stencilIdx matches Tile.stencil5 layout: row-major over [-2..2] x [-2..2].
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
  name: "Trinity",
  author: "core",
  version: 1,
  description: "Convolves friendly density with three-in-a-row kernels and pushes that way.",
  summary: `Thesis: in PixelWars, three friendlies in a line is structurally
strong — the middle tile gets reinforced from both sides while the ends
project pressure forward. So instead of looking at immediate neighbors,
each army inspects its 5x5 stencil and runs four diagonal "knight-ish"
kernels that score how much friendly mass would be aligned with it if it
moved in each cardinal direction. Pick the direction with the best
alignment score and shove almost everything (strength - 1) that way. This
makes Trinity behave like a flocking bot without any explicit
communication between armies — the alignment is emergent from each army
independently optimizing the same convolution.`,
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
    if (target) army.attack(target, army.strength - 1);
  },
};
