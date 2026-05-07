// Map presets used by the tournament runner. Each preset is map config + a
// function that returns starting positions for `n` players.

function linePositions(n, { width, height }) {
  // Even-spaced on the wrap line. Spacing W/n is identical between any
  // two neighbors *including* the pair that touches across the wrap
  // edge — without this, the leftmost and rightmost players sit just a
  // few columns apart on the torus and crush each other's start tiles.
  const y = Math.floor(height / 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? Math.floor(width / 2) : Math.round(width * (i + 0.5) / n) % width;
    out.push({ x, y, strength: 1 });
  }
  return out;
}

export const MAPS = {
  // Official ranking map. Picked by the cross-map discrimination sweep
  // (tournament/map-search/discriminate.js): of all configs varying size
  // x growth x maxArmy x k, this one's per-bot ranking best matches the
  // leave-one-out consensus across the rest, with the highest split-half
  // reliability per CPU-second. k=5 spreads more comparisons per match
  // than k=4 -> per-bot stats stabilize faster at the same match budget.
  // Composite=1.01, discLOO=0.84, reliability=0.56, median match=349 ticks.
  lab1: {
    name: "lab1",
    config: { width: 30, height: 22, growth: 1.8, maxArmy: 12, wrap: true },
    players: 5,
    positions: (n) => linePositions(n, { width: 30, height: 22 }),
  },
  // Bracket map. Top of discriminate.json without the reliability
  // penalty: 24x18 g1.8 m12 wrap line at K=3 (composite=2.012,
  // discLOO=0.84, median match ~30 ticks). Single-tournament rankings
  // are too noisy here for ranking work, but bracket Phase 2 runs
  // multiple tournaments and accepts that noise — the speed wins.
  bracket1: {
    name: "bracket1",
    config: { width: 24, height: 18, growth: 1.8, maxArmy: 12, wrap: true },
    players: 3,
    positions: (n) => linePositions(n, { width: 24, height: 18 }),
  },
};
