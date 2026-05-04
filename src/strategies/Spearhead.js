import { sumStrength } from "../core/Army.js";

// Three-in-a-row aligned WITH motion: support comes from the two cells
// directly behind on the same line, weighted nearer-cell-first. Inverts
// Trinity's geometry — Trinity's kernels actually form a perpendicular
// wall plus one rear cell; Spearhead is the pure arrow-tip thesis.
const KERNELS = [
  [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 2, 1],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [1, 2, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 2, 0, 0],
    [0, 0, 1, 0, 0],
  ],
  [
    [0, 0, 1, 0, 0],
    [0, 0, 2, 0, 0],
    [0, 0, 0, 0, 0],
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
  name: "Spearhead",
  author: "core",
  version: 1,
  description: "Three-in-a-row aligned with motion — moves where there's a friendly column behind it.",
  summary: `Trinity's foil. Where Trinity rewards flank friendlies (a
perpendicular wall plus one rear cell), Spearhead rewards friendlies
in line with the direction of motion: two cells directly behind,
near-cell weighted twice. The thesis is the literal reading of "three
in a row is strong" — the army is the spearpoint, and the column
behind keeps feeding pressure forward into whatever it hits. Expected
to be more brittle than Trinity in the open (no flank support, easy
to flank) but to punch through harder along axes where a column has
already formed. Mostly useful as an A/B against Trinity to test
whether the wall-plus-rear geometry actually beats pure column
alignment, or whether Trinity is just the better-tuned of two
similar ideas.`,
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
