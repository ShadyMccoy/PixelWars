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

function cornersPositions(n, { width, height, edgePad = 2 }) {
  const corners = [
    { x: edgePad, y: edgePad },
    { x: width - 1 - edgePad, y: height - 1 - edgePad },
    { x: width - 1 - edgePad, y: edgePad },
    { x: edgePad, y: height - 1 - edgePad },
    { x: Math.floor(width / 2), y: edgePad },
    { x: Math.floor(width / 2), y: height - 1 - edgePad },
    { x: edgePad, y: Math.floor(height / 2) },
    { x: width - 1 - edgePad, y: Math.floor(height / 2) },
  ];
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = corners[i % corners.length];
    out.push({ x: c.x, y: c.y, strength: 1 });
  }
  return out;
}

function clusteredPairsPositions(n, { width, height, radiusFactor = 0.35, pairOffset = 2 }) {
  const cx = width / 2, cy = height / 2;
  const r = Math.min(width, height) * radiusFactor;
  const pairs = Math.ceil(n / 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const pairIdx = Math.floor(i / 2);
    const angle = (pairIdx / pairs) * Math.PI * 2;
    const baseX = cx + Math.cos(angle) * r;
    const baseY = cy + Math.sin(angle) * r;
    const sign = i % 2 === 0 ? -1 : 1;
    const px = baseX + Math.cos(angle + Math.PI / 2) * pairOffset * sign;
    const py = baseY + Math.sin(angle + Math.PI / 2) * pairOffset * sign;
    out.push({
      x: clamp(Math.floor(px), 1, width - 2),
      y: clamp(Math.floor(py), 1, height - 2),
      strength: 1,
    });
  }
  return out;
}

export const MAPS = {
  arena: {
    name: "arena",
    config: { width: 30, height: 22, growth: 2, maxArmy: 12, wrap: true },
    players: 4,
    positions: (n) => ringPositions(n, { width: 30, height: 22, radiusFactor: 0.4 }),
  },
  classic: {
    name: "classic",
    config: { width: 40, height: 30, growth: 1, maxArmy: 12, wrap: true },
    players: 6,
    positions: (n) => ringPositions(n, { width: 40, height: 30, radiusFactor: 0.42 }),
  },
  tight: {
    name: "tight",
    config: { width: 22, height: 16, growth: 2.2, maxArmy: 12, wrap: true },
    players: 3,
    positions: (n) => ringPositions(n, { width: 22, height: 16, radiusFactor: 0.38 }),
  },
  // Lab-tested map (24x18 g=1.8 wrap line k=4). Composite score from map-search ranking, disc=0.74 rel=0.87.
  lab1: {
    name: "lab1",
    config: { width: 24, height: 18, growth: 1.8, maxArmy: 12, wrap: true },
    players: 4,
    positions: (n) => linePositions(n, { width: 24, height: 18 }),
  },
  // Lab-tested map (30x22 g=1.8 wrap line k=4). Composite score from map-search ranking, disc=0.79 rel=0.89.
  lab2: {
    name: "lab2",
    config: { width: 30, height: 22, growth: 1.8, maxArmy: 12, wrap: true },
    players: 4,
    positions: (n) => linePositions(n, { width: 30, height: 22 }),
  },
  // Lab-tested map (38x28 g=1.8 wrap line k=4). Composite score from map-search ranking, disc=0.73 rel=0.90.
  lab3: {
    name: "lab3",
    config: { width: 38, height: 28, growth: 1.8, maxArmy: 12, wrap: true },
    players: 4,
    positions: (n) => linePositions(n, { width: 38, height: 28 }),
  },
};
