// 100 parameterized bots, built from src/strategies/factory.js. Grouped into
// ten thematic families of ten:
//
//   Hunter_*      target weakest WINNABLE enemy; vary commitment fraction
//   Probe_*       send a small fractional force toward the weakest neighbor
//   Patient_*     wait until a strength threshold, then attack
//   Drift_*       bias movement in a specific compass direction
//   Pacifist_*    only attack empty tiles; vary expansion appetite
//   Bully_*       target the STRONGEST enemy (whether winnable or not)
//   Cluster_*     prefer attacking tiles already held by friendlies
//   Scatter_*     refuse to land on friendly tiles; vary target preference
//   Pulse_*       only act on a tick cadence (period & phase)
//   Stencil_*     pick direction by convolving 5x5 kernels (Trinity-style)

import { makeBot, makeStencilBot } from "./factory.js";

const pad2 = (n) => String(n).padStart(2, "0");

const HUNTERS = [];
for (let i = 1; i <= 10; i++) {
  const frac = i / 10;
  HUNTERS.push(makeBot({
    name: `Hunter_${pad2(i)}`,
    description: `Targets weakest beatable enemy; commits ${Math.round(frac * 100)}% of force.`,
    requireEnemy: true,
    requireWinnable: true,
    forceFrac: frac,
    fallbackName: "slow",
  }));
}

const PROBES = [];
for (let i = 1; i <= 10; i++) {
  const frac = i / 20; // 5% .. 50%
  PROBES.push(makeBot({
    name: `Probe_${pad2(i)}`,
    description: `Sends ${Math.round(frac * 100)}% of force toward the weakest neighbor.`,
    forceFrac: frac,
    forceMinPower: 1.0,
    minStrengthAbs: 2.0,
  }));
}

const PATIENTS = [];
for (let i = 1; i <= 10; i++) {
  const thresh = 0.1 + i * 0.08; // 18% .. 90%
  PATIENTS.push(makeBot({
    name: `Patient_${pad2(i)}`,
    description: `Holds until ${Math.round(thresh * 100)}% strength, then attacks weakest neighbor with balance.`,
    minStrengthFrac: thresh,
    forceMode: "balance",
  }));
}

const DRIFTS_SPEC = [
  ["E",      [-2, 4, 0, 0]],
  ["W",      [4, -2, 0, 0]],
  ["N",      [0, 0, 4, -2]],
  ["S",      [0, 0, -2, 4]],
  ["NE",     [-2, 3, 3, -2]],
  ["NW",     [3, -2, 3, -2]],
  ["SE",     [-2, 3, -2, 3]],
  ["SW",     [3, -2, -2, 3]],
  ["EvN",    [-1, 1, 1, -1]],   // softer east+north pull
  ["WvS",    [1, -1, -1, 1]],   // softer west+south pull
];
const DRIFTS = DRIFTS_SPEC.map(([dir, grad]) => makeBot({
  name: `Drift_${dir}`,
  description: `Like SlowAndSteady but biased ${dir}.`,
  gradient: grad,
  forceMode: "balance",
}));

const PACIFISTS = [];
// Pacifists never engage enemies. They only land on empty tiles, with
// varying minimum strengths and commitment fractions.
const PACIFIST_SPEC = [
  { thresh: 0.0, frac: 0.5 },
  { thresh: 0.0, frac: 1.0 },
  { thresh: 0.2, frac: 0.5 },
  { thresh: 0.2, frac: 1.0 },
  { thresh: 0.4, frac: 0.5 },
  { thresh: 0.4, frac: 1.0 },
  { thresh: 0.6, frac: 0.5 },
  { thresh: 0.6, frac: 1.0 },
  { thresh: 0.8, frac: 0.5 },
  { thresh: 0.8, frac: 1.0 },
];
for (let i = 0; i < PACIFIST_SPEC.length; i++) {
  const { thresh, frac } = PACIFIST_SPEC[i];
  PACIFISTS.push(makeBot({
    name: `Pacifist_${pad2(i + 1)}`,
    description: `Expands only into empty tiles (>= ${Math.round(thresh * 100)}% strength, ${Math.round(frac * 100)}% commitment).`,
    requireEmpty: true,
    minStrengthFrac: thresh,
    forceFrac: frac,
  }));
}

const BULLIES = [];
for (let i = 1; i <= 10; i++) {
  const frac = i / 10;
  // Half the bullies require winnable, half charge regardless.
  const winnable = i % 2 === 0;
  BULLIES.push(makeBot({
    name: `Bully_${pad2(i)}`,
    description: `Charges the STRONGEST adjacent enemy${winnable ? " it can beat" : ""}; ${Math.round(frac * 100)}% commitment.`,
    pickMode: "max",
    requireEnemy: true,
    requireWinnable: winnable,
    forceFrac: frac,
    fallbackName: "slow",
  }));
}

const CLUSTERS = [];
// Reinforcers: prefer tiles with the most friendly armies. Vary how strongly
// friendliness pulls and the activation strength threshold.
const CLUSTER_SPEC = [
  { wf: 5,  thresh: 0.2 },
  { wf: 5,  thresh: 0.5 },
  { wf: 10, thresh: 0.2 },
  { wf: 10, thresh: 0.5 },
  { wf: 20, thresh: 0.3 },
  { wf: 20, thresh: 0.7 },
  { wf: 50, thresh: 0.4 },
  { wf: 50, thresh: 0.85 },
  { wf: 3,  thresh: 0.0 },
  { wf: 100, thresh: 0.5 },
];
for (let i = 0; i < CLUSTER_SPEC.length; i++) {
  const { wf, thresh } = CLUSTER_SPEC[i];
  CLUSTERS.push(makeBot({
    name: `Cluster_${pad2(i + 1)}`,
    description: `Pulls toward tiles with friendly armies (weight ${wf}); waits until ${Math.round(thresh * 100)}% strength.`,
    weightFriendly: wf,
    weightEnemy: 1,
    minStrengthFrac: thresh,
    forceMode: "balance",
  }));
}

const SCATTERS = [];
// Anti-cluster: never land on a tile that already has a friendly. Vary
// commitment and whether they prefer empty over enemy.
const SCATTER_SPEC = [
  { frac: 0.5, emptyBonus: 0 },
  { frac: 1.0, emptyBonus: 0 },
  { frac: 0.5, emptyBonus: 5 },
  { frac: 1.0, emptyBonus: 5 },
  { frac: 0.5, emptyBonus: 20 },
  { frac: 1.0, emptyBonus: 20 },
  { frac: 0.3, emptyBonus: 10 },
  { frac: 0.7, emptyBonus: 10 },
  { frac: 0.9, emptyBonus: 50 },
  { frac: 0.4, emptyBonus: 0 },
];
for (let i = 0; i < SCATTER_SPEC.length; i++) {
  const { frac, emptyBonus } = SCATTER_SPEC[i];
  SCATTERS.push(makeBot({
    name: `Scatter_${pad2(i + 1)}`,
    description: `Avoids friendly tiles${emptyBonus ? ", prefers empty ones" : ""}; ${Math.round(frac * 100)}% commitment.`,
    avoidFriendly: true,
    weightEmptyBonus: emptyBonus,
    forceFrac: frac,
  }));
}

const PULSES = [];
// Tick-gated bots: act only on selected ticks. The "off" ticks let strength
// regenerate. Vary period, phase, and commitment mode.
const PULSE_SPEC = [
  { period: 2, phase: 0, mode: "all",     desc: "every other tick (even), all-in" },
  { period: 2, phase: 1, mode: "all",     desc: "every other tick (odd), all-in" },
  { period: 3, phase: 0, mode: "all",     desc: "every 3rd tick, all-in" },
  { period: 3, phase: 0, mode: "balance", desc: "every 3rd tick, balanced" },
  { period: 4, phase: 0, mode: "all",     desc: "every 4th tick, all-in" },
  { period: 4, phase: 2, mode: "balance", desc: "every 4th tick (offset), balanced" },
  { period: 5, phase: 0, mode: "all",     desc: "every 5th tick, all-in" },
  { period: 6, phase: 0, mode: "balance", desc: "every 6th tick, balanced" },
  { period: 8, phase: 0, mode: "all",     desc: "every 8th tick, all-in" },
  { period: 10, phase: 0, mode: "all",    desc: "every 10th tick, all-in" },
];
for (let i = 0; i < PULSE_SPEC.length; i++) {
  const s = PULSE_SPEC[i];
  PULSES.push(makeBot({
    name: `Pulse_${pad2(i + 1)}`,
    description: `Acts ${s.desc}; targets weakest neighbor on active ticks.`,
    tickPeriod: s.period,
    tickPhase: s.phase,
    forceMode: s.mode,
    forceFrac: 1.0,
  }));
}

// Stencil bots: build kernels keyed to direction (0=W,1=E,2=N,3=S).
// Each pattern is an array of [dr, dc, weight] entries; we splat it into a
// 5x5 kernel rotated for each direction. Centre is (2,2).
function kernelFromOffsets(offsets) {
  const k = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]);
  for (const [dr, dc, w] of offsets) k[2 + dr][2 + dc] = w;
  return k;
}

function rotateOffsetsForDir(offsets, dir) {
  // Base offsets are written for direction = East. Rotate for others.
  // East: (dr, dc) unchanged
  // West: (dr, -dc)
  // North: (-dc, dr)
  // South: (dc, -dr)
  return offsets.map(([dr, dc, w]) => {
    switch (dir) {
      case 0: return [dr, -dc, w];   // West
      case 1: return [dr, dc, w];    // East
      case 2: return [-dc, dr, w];   // North
      case 3: return [dc, -dr, w];   // South
    }
    return [dr, dc, w];
  });
}

function fourKernels(eastPattern) {
  return [0, 1, 2, 3].map((dir) =>
    kernelFromOffsets(rotateOffsetsForDir(eastPattern, dir))
  );
}

// Each "pattern" is a friendly-density preference for the East direction.
// Positive cells = "I want my friendlies HERE before I push east."
const STENCIL_PATTERNS = [
  // Forward line (push toward an east-pointing friendly stripe)
  { name: "01", desc: "front-line: friendlies one step east",
    east: [[0, 1, 1], [0, 2, 1]] },
  // Backstop: friendlies behind, push forward
  { name: "02", desc: "backstop: friendlies west, push east",
    east: [[0, -1, 1], [0, -2, 1]] },
  // Wedge: friendlies on diagonals
  { name: "03", desc: "wedge: friendlies on forward diagonals",
    east: [[1, 1, 1], [-1, 1, 1]] },
  // Flank-protected: friendlies on flanks
  { name: "04", desc: "flank-protected: friendlies on perpendicular flanks",
    east: [[1, 0, 1], [-1, 0, 1]] },
  // Original Trinity-style three-in-a-row
  { name: "05", desc: "trinity: friendly + diagonal + center",
    east: [[-1, 1, 1], [0, 1, 1], [1, 1, 1]] },
  // Distant push: only far cells matter
  { name: "06", desc: "long-range: pulls toward friendlies two tiles ahead",
    east: [[0, 2, 2], [-1, 2, 1], [1, 2, 1]] },
  // Repel: AVOID friendlies ahead (negative weight) -> spread out
  { name: "07", desc: "repel: avoids friendlies ahead, seeks open ground",
    east: [[0, 1, -2], [0, 2, -1]] },
  // L-shape preference
  { name: "08", desc: "L-shape: friendly ahead and to one side",
    east: [[0, 1, 1], [1, 1, 1], [1, 0, 1]] },
  // Box: surround pattern
  { name: "09", desc: "box: friendlies forming a forward ring",
    east: [[1, 1, 1], [-1, 1, 1], [0, 2, 1], [1, 2, 1], [-1, 2, 1]] },
  // Asymmetric: two ahead one behind
  { name: "10", desc: "asymmetric: forward bias with rear support",
    east: [[0, 1, 2], [0, 2, 1], [0, -1, 1]] },
];
const STENCILS = STENCIL_PATTERNS.map((p) => makeStencilBot({
  name: `Stencil_${p.name}`,
  description: `Convolves a 5x5 kernel (${p.desc}) and pushes that way.`,
  kernels: fourKernels(p.east),
  forceMode: "all",
  fallbackName: "slow",
}));

export const GENERATED = [
  ...HUNTERS,
  ...PROBES,
  ...PATIENTS,
  ...DRIFTS,
  ...PACIFISTS,
  ...BULLIES,
  ...CLUSTERS,
  ...SCATTERS,
  ...PULSES,
  ...STENCILS,
];
