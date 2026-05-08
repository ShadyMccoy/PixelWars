// Smartiepants: the seed of the neural-evolution lineage.
//
// Architecture: a single-layer neural net. Each tick, every army
// extracts a fixed-length feature vector from its local view via
// featurize(), multiplies by a weight matrix to produce one score per
// cardinal direction, and attacks the argmax direction.
//
// Genome shape: weights is a flat Float32Array of length
// FEATURE_COUNT × DIRECTIONS, row-major (input k, output d) at index
// k*DIRECTIONS + d. Descendants will mutate, recombine, and eventually
// grow this matrix.
//
// Seed weights below encode a Trinity-style prior: friendly mass on
// the side we'd push toward attracts; enemy mass repels. Self/bias
// weights stay zero so the seed is purely reactive to the local field
// — gives evolution a clean baseline to deviate from.

import { argmax, forward } from "../core/nn.js";
import {
  DIRECTIONS,
  FEATURE_COUNT,
  QUADRANT_CELLS,
  featurize,
} from "../core/featurize.js";

export const WEIGHT_COUNT = FEATURE_COUNT * DIRECTIONS;

const STENCIL_FEATURES = 50;
const QUADRANT_OFFSET = STENCIL_FEATURES;

function buildSeedWeights() {
  const W = new Float32Array(WEIGHT_COUNT);
  for (let d = 0; d < DIRECTIONS; d++) {
    const cells = QUADRANT_CELLS[d];
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      W[(2 * c) * DIRECTIONS + d] = 1;       // friendly attracts
      W[(2 * c + 1) * DIRECTIONS + d] = -1;  // enemy repels
    }
    W[(QUADRANT_OFFSET + 2 * d) * DIRECTIONS + d] = 0.5;
    W[(QUADRANT_OFFSET + 2 * d + 1) * DIRECTIONS + d] = -0.5;
  }
  return W;
}

const SEED_WEIGHTS = buildSeedWeights();
const featBuf = new Float32Array(FEATURE_COUNT);
const scoreBuf = new Float32Array(DIRECTIONS);

export default {
  name: "Smartiepants",
  author: "core",
  version: 1,
  description:
    "Single-layer NN over a foveated feature pack; first bot in the evolvable line.",
  summary: `Smartiepants is the seed of the neural-evolution lineage. It
extracts a fixed feature vector from each army's local view (5×5 stencil
two-channel + half-plane aggregates + self/bias), runs one matrix
multiplication into 4 directional scores, and attacks the argmax
direction. The genome is the weight matrix; future descendants will
mutate, recombine, and grow it. Seed weights encode a Trinity-style
prior: push toward friendly mass and away from enemy mass on the side
you're moving to.`,
  weights: SEED_WEIGHTS,
  featureCount: FEATURE_COUNT,
  outputCount: DIRECTIONS,
  act(army) {
    const tile = army.tile;
    if (!tile) return;
    const x = featurize(army, featBuf);
    forward(x, SEED_WEIGHTS, scoreBuf, FEATURE_COUNT, DIRECTIONS);
    const dir = argmax(scoreBuf, DIRECTIONS);
    const target = tile.neighbors[dir];
    if (target) army.attack(target, army.attackPower);
  },
};
