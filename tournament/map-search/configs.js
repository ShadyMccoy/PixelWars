// Map config generator for the search.
//
// Each config is a `(width, height, growth, maxArmy, wrap, k, topology)`
// tuple. Yields objects in the same shape as `tournament/maps.js` entries
// (`{ name, config, positions(n) }`) so existing `runMatch` consumes them
// unchanged.
//
//   makeConfig(spec)    — build a single named config from a spec object
//   topologyFns         — registry of spawn-position generators
//   defaultGrid()       — the production search grid (~80–120 configs)
//   smallGrid()         — tiny grid used by the unit tests / smoke runs

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---------- topologies ----------
//
// A topology fn receives `(n, { width, height })` and returns an array of
// `n` `{x, y, strength}` start positions. Topologies must be deterministic
// (so seeds reproduce) and must keep all positions inside the playable
// area with at least 1 tile of edge padding.

function ringPositions(n, { width, height, radiusFactor = 0.4, edgePad = 1 }) {
  const cx = width / 2, cy = height / 2;
  const r = Math.min(width, height) * radiusFactor;
  const out = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    out.push({
      x: clamp(Math.floor(cx + Math.cos(angle) * r), edgePad, width - 1 - edgePad),
      y: clamp(Math.floor(cy + Math.sin(angle) * r), edgePad, height - 1 - edgePad),
      strength: 1,
    });
  }
  return out;
}

// Players placed on a horizontal line, evenly spaced. Forces lateral
// contact and removes the rotational symmetry of ring spawns.
function linePositions(n, { width, height, edgePad = 1 }) {
  const y = Math.floor(height / 2);
  const usable = width - 2 * edgePad - 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1
      ? Math.floor(width / 2)
      : edgePad + Math.round((usable * i) / (n - 1));
    out.push({ x, y, strength: 1 });
  }
  return out;
}

// Players in opposite corners (round-robin around the corners). With wrap
// off this maximizes early travel distance; with wrap on it's similar to
// ring but with discrete asymmetry.
function cornersPositions(n, { width, height, edgePad = 2 }) {
  const corners = [
    { x: edgePad,                     y: edgePad },
    { x: width - 1 - edgePad,         y: height - 1 - edgePad },
    { x: width - 1 - edgePad,         y: edgePad },
    { x: edgePad,                     y: height - 1 - edgePad },
    { x: Math.floor(width / 2),       y: edgePad },
    { x: Math.floor(width / 2),       y: height - 1 - edgePad },
    { x: edgePad,                     y: Math.floor(height / 2) },
    { x: width - 1 - edgePad,         y: Math.floor(height / 2) },
  ];
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = corners[i % corners.length];
    out.push({ x: c.x, y: c.y, strength: 1 });
  }
  return out;
}

// Pairs of allies-distance neighbors (every other player is close to its
// predecessor). Probes "natural alliance" dynamics — bots that gang up
// on the leader benefit, bots that just attack nearest neighbor are
// punished early.
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
    // Offset the pair perpendicular to the radius so they're side-by-side.
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

export const topologyFns = {
  ring: (n, dims) => ringPositions(n, { ...dims, radiusFactor: 0.42 }),
  ringTight: (n, dims) => ringPositions(n, { ...dims, radiusFactor: 0.30 }),
  line: (n, dims) => linePositions(n, dims),
  corners: (n, dims) => cornersPositions(n, dims),
  pairs: (n, dims) => clusteredPairsPositions(n, dims),
};

// ---------- config builder ----------

export function makeConfig(spec) {
  const { width, height, growth, maxArmy, wrap, topology } = spec;
  if (!topologyFns[topology]) {
    throw new Error(`Unknown topology: ${topology}. Have: ${Object.keys(topologyFns).join(", ")}`);
  }
  const name = spec.name ?? configName(spec);
  return {
    name,
    spec: { ...spec },
    config: { width, height, growth, maxArmy, wrap },
    positions: (n) => topologyFns[topology](n, { width, height }),
  };
}

export function configName(spec) {
  const { width, height, growth, maxArmy, wrap, topology, k } = spec;
  return [
    `${width}x${height}`,
    `g${String(growth).replace(".", "p")}`,
    `m${maxArmy}`,
    wrap ? "wrap" : "nowrap",
    topology,
    k != null ? `k${k}` : null,
  ].filter(Boolean).join("_");
}

// ---------- search grids ----------

// Default search grid. Covers a sensible Cartesian product without
// exploding combinatorially. ~108 configs at default settings.
export function defaultGrid() {
  const sizes = [
    { width: 24, height: 18 },  // tight
    { width: 30, height: 22 },  // arena
    { width: 38, height: 28 },  // medium
    { width: 50, height: 36 },  // large
  ];
  const growths = [0.8, 1.2, 1.8];
  const wraps = [true, false];
  const topologies = ["ring", "line", "corners", "pairs"];
  const ks = [4, 6];
  const maxArmys = [6];

  const out = [];
  for (const s of sizes) {
    for (const g of growths) {
      for (const w of wraps) {
        for (const t of topologies) {
          for (const k of ks) {
            for (const m of maxArmys) {
              out.push(makeConfig({
                width: s.width, height: s.height,
                growth: g, maxArmy: m, wrap: w,
                topology: t, k,
              }));
            }
          }
        }
      }
    }
  }
  return out;
}

// Tiny grid for unit tests / smoke runs. ~6 configs.
export function smallGrid() {
  return [
    makeConfig({ width: 24, height: 18, growth: 1.5, maxArmy: 6, wrap: true,  topology: "ring",    k: 4 }),
    makeConfig({ width: 30, height: 22, growth: 1.5, maxArmy: 6, wrap: true,  topology: "ring",    k: 4 }),
    makeConfig({ width: 30, height: 22, growth: 1.5, maxArmy: 6, wrap: true,  topology: "line",    k: 4 }),
    makeConfig({ width: 30, height: 22, growth: 1.5, maxArmy: 6, wrap: false, topology: "corners", k: 4 }),
    makeConfig({ width: 38, height: 28, growth: 1.0, maxArmy: 6, wrap: true,  topology: "pairs",   k: 6 }),
    makeConfig({ width: 38, height: 28, growth: 1.0, maxArmy: 6, wrap: false, topology: "ring",    k: 6 }),
  ];
}

// Sentinel "known-bad" configs planted to verify the metric isn't fooled.
// These should consistently score near the bottom; if they don't, the
// composite metric or the anchor set has drifted.
//
// Tuned to be unambiguously degenerate: huge+slow maps where no contact
// happens, and micro maps where players are crammed into <10 tiles total
// (so first-tick adjacency dominates strategy).
export function planted() {
  return [
    // Way too big with tiny growth — no contact, decays into noise; almost
    // every match times out. Discrimination is destroyed by the timeout cap.
    makeConfig({ name: "PLANT_huge_slow", width: 60, height: 44, growth: 0.4, maxArmy: 6, wrap: false, topology: "ring", k: 4 }),
    // Micro-arena: 9×7 with k=6 packs players elbow-to-elbow on spawn.
    // Whoever spawns adjacent to two others vs. one others has very
    // different match outcomes regardless of strategy → lottery.
    makeConfig({ name: "PLANT_micro_pack", width: 9, height: 7, growth: 2.0, maxArmy: 4, wrap: true, topology: "ring", k: 6 }),
    // Asymmetric "corner-cram": k=6 forced into a 4-corner topology means
    // some pairs spawn 1 tile apart while others spawn diagonally; the
    // outcome is dominated by which two unlucky bots got crammed onto the
    // duplicate corner. Strategy is irrelevant.
    makeConfig({ name: "PLANT_corner_cram", width: 18, height: 14, growth: 1.5, maxArmy: 6, wrap: false, topology: "corners", k: 6 }),
  ];
}
