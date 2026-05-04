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

export const MAPS = {
  arena: {
    name: "arena",
    config: { width: 30, height: 22, growth: 2, maxArmy: 6, wrap: true },
    positions: (n) => ringPositions(n, { width: 30, height: 22, radiusFactor: 0.4 }),
  },
  classic: {
    name: "classic",
    config: { width: 40, height: 30, growth: 1, maxArmy: 6, wrap: true },
    positions: (n) => ringPositions(n, { width: 40, height: 30, radiusFactor: 0.42 }),
  },
  royale: {
    name: "royale",
    config: { width: 44, height: 32, growth: 1.2, maxArmy: 6, wrap: false },
    positions: (n) => ringPositions(n, { width: 44, height: 32, radiusFactor: 0.45, edgePad: 2 }),
  },
  tight: {
    name: "tight",
    config: { width: 22, height: 16, growth: 2.2, maxArmy: 6, wrap: true },
    positions: (n) => ringPositions(n, { width: 22, height: 16, radiusFactor: 0.38 }),
  },
};
