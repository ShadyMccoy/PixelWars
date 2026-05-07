// Map presets used by the tournament runner. Each preset is map config + a
// function that returns starting positions for `n` players.

function ringPositions(n, { width, height, radiusFactor = 0.4, edgePad = 1 }) {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * radiusFactor;
  const pad = edgePad;
  const positions = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const x = clamp(Math.floor(cx + Math.cos(angle) * r), pad, width - 1 - pad);
    const y = clamp(Math.floor(cy + Math.sin(angle) * r), pad, height - 1 - pad);
    positions.push({ x, y, strength: 1 });
  }
  return positions;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}


function linePositions(n, { width, height, edgePad = 1 }) {
  const y = Math.floor(height / 2);
  const usable = width - 2 * edgePad - 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? Math.floor(width / 2) : edgePad + Math.round((usable * i) / (n - 1));
    out.push({ x, y, strength: 1 });
  }
  return out;
}

export const MAPS = {
  // Arena: kept for back-compat with the saved arena league (used as
  // ground truth by tournament/map-search/*) and for tests that
  // reference MAPS.arena directly.
  arena: {
    name: "arena",
    config: { width: 30, height: 22, growth: 2, maxArmy: 12, wrap: true },
    players: 4,
    positions: (n) => ringPositions(n, { width: 30, height: 22, radiusFactor: 0.4 }),
  },
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
};
