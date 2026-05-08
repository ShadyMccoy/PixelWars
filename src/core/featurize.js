// Feature extraction for evolved bots. Builds a fixed-shape input
// vector from an army's perspective.
//
// Layout (FEATURE_COUNT total):
//   [0..49]   Stencil5 cells, two channels each (friendly, enemy
//             strength). Cell c follows tile.stencil5 layout —
//             row-major over (di+2, dj+2) in [0..4]² where di is the
//             y-offset and dj the x-offset. Contributions land at
//             indices 2*c (friendly) and 2*c + 1 (enemy).
//   [50..57]  Half-plane aggregates within the stencil. Four
//             directions × two channels. Direction order matches
//             Tile.neighbors (W, E, N, S). Each half-plane is the
//             10-cell strip strictly on the push side of center.
//   [58]      Self strength normalized by maxStrength.
//   [59]      Bias = 1.
//
// Bumping FEATURE_COUNT or DIRECTIONS reshapes the genome — keep them
// in sync with anything that persists weights.

const STENCIL_CELLS = 25;
const STENCIL_CHANNELS = 2;
const STENCIL_FEATURES = STENCIL_CELLS * STENCIL_CHANNELS; // 50
const QUADRANT_FEATURES = 4 * STENCIL_CHANNELS;            // 8
const SELF_FEATURES = 1;
const BIAS_FEATURES = 1;

export const FEATURE_COUNT =
  STENCIL_FEATURES + QUADRANT_FEATURES + SELF_FEATURES + BIAS_FEATURES;
export const DIRECTIONS = 4;

const QUADRANT_OFFSET = STENCIL_FEATURES;
const SELF_OFFSET = STENCIL_FEATURES + QUADRANT_FEATURES;
const BIAS_OFFSET = SELF_OFFSET + SELF_FEATURES;

// Half-plane stencil cell indices per direction, in (W, E, N, S)
// order. Column < 2 → west of center; row < 2 → north of center; etc.
// Center cells (col == 2 or row == 2 on the relevant axis) are
// excluded so the four quadrants don't overlap on the push axis.
export const QUADRANT_CELLS = (() => {
  const cells = [[], [], [], []];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const idx = row * 5 + col;
      if (col < 2) cells[0].push(idx);
      if (col > 2) cells[1].push(idx);
      if (row < 2) cells[2].push(idx);
      if (row > 2) cells[3].push(idx);
    }
  }
  return cells;
})();

// Reusable scratch buffer. Strategies that need to keep features
// across calls must copy.
const sharedBuffer = new Float32Array(FEATURE_COUNT);

export function featurize(army, out = sharedBuffer) {
  out.fill(0);
  const tile = army.tile;
  if (!tile) return out;

  const stencil = tile.stencil5;
  const vid = army.player.id;

  for (let c = 0; c < STENCIL_CELLS; c++) {
    const t = stencil[c];
    if (!t) continue;
    let friendly = 0;
    let enemy = 0;
    const armies = t.armies;
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i];
      if (a.player.id === vid) friendly += a.strength;
      else enemy += a.strength;
    }
    out[2 * c] = friendly;
    out[2 * c + 1] = enemy;
  }

  let qIdx = QUADRANT_OFFSET;
  for (let d = 0; d < 4; d++) {
    const cells = QUADRANT_CELLS[d];
    let f = 0;
    let e = 0;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      f += out[2 * c];
      e += out[2 * c + 1];
    }
    out[qIdx++] = f;
    out[qIdx++] = e;
  }

  out[SELF_OFFSET] = army.maxStrength > 0 ? army.strength / army.maxStrength : 0;
  out[BIAS_OFFSET] = 1;

  return out;
}
