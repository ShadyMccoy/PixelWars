// Parametric Spearhead. The original Spearhead bakes in 7 magic
// constants (attacker bonus, four kernel weights collapsed to three
// distinct ones, empty-target bonus, friendly-target penalty, commit
// threshold). This template exposes them all as parameters so a
// search driver can sweep the space.
//
// makeSpearheadVariant({...params, name}) -> strategy object.
// Pass it to runMatch in a lineup like any other strategy.

import { sumStrength } from "../../core/Army.js";
import SlowAndSteady from "../SlowAndSteady.js";
import Trinity from "../Trinity.js";

export const SPEARHEAD_DEFAULTS = Object.freeze({
  attackerBonus: 1.4,
  bodyClose: 3,        // weight at [0, -1] (one cell behind on axis)
  bodyFar: 1,          // weight at [0, -2] (two cells behind on axis)
  flankClose: 1,       // weight at [-1, -1] and [1, -1] (rear flanks)
  emptyBonus: 20,      // added when target neighbor is empty
  friendlyPenalty: -10, // added when target neighbor has a friendly
  commitThreshold: 0.5, // minimum attackPower before committing a stencil push
});

// Schema (used by the GA): per-knob bounds + step size + integer flag.
export const SPEARHEAD_SCHEMA = Object.freeze({
  attackerBonus:    { min: 1.0,   max: 1.7,  sigma: 0.04 },
  bodyClose:        { min: 1,     max: 6,    sigma: 0.5,  int: true },
  bodyFar:          { min: 0,     max: 4,    sigma: 0.5,  int: true },
  flankClose:       { min: 0,     max: 4,    sigma: 0.5,  int: true },
  emptyBonus:       { min: 0,     max: 60,   sigma: 4 },
  friendlyPenalty:  { min: -40,   max: 0,    sigma: 4 },
  commitThreshold:  { min: 0.0,   max: 1.5,  sigma: 0.1 },
});

function buildKernels({ bodyClose, bodyFar, flankClose }) {
  // East-facing offsets: [dy, dx, weight]. Rotated to four cardinals.
  const east = [
    [0, -1, bodyClose],
    [0, -2, bodyFar],
    [-1, -1, flankClose],
    [1, -1, flankClose],
  ];
  function rotate([dy, dx, w], dir) {
    switch (dir) {
      case 0: return [dy, -dx, w];
      case 1: return [dy, dx, w];
      case 2: return [-dx, dy, w];
      case 3: return [dx, -dy, w];
    }
    return [dy, dx, w];
  }
  return [0, 1, 2, 3].map((dir) => {
    const out = [];
    for (const t of east) {
      const [dy, dx, w] = rotate(t, dir);
      const idx = (dy + 2) * 5 + (dx + 2);
      if (idx < 0 || idx >= 25) continue;
      // Skip zero-weight contributions for speed; they have no effect.
      if (w === 0) continue;
      out.push(idx, w);
    }
    return out;
  });
}

export function makeSpearheadVariant(params = {}) {
  const p = { ...SPEARHEAD_DEFAULTS, ...params };
  const name = params.name ?? "ParamSpearhead";
  const OFFSETS = buildKernels(p);
  const ATTACKER_BONUS = p.attackerBonus;
  const COMMIT = p.commitThreshold;
  const EMPTY = p.emptyBonus;
  const FRIENDLY = p.friendlyPenalty;

  return spearheadFromOffsets({ name, OFFSETS, ATTACKER_BONUS, COMMIT, EMPTY, FRIENDLY,
    description: `Parametric Spearhead (ab=${ATTACKER_BONUS.toFixed(2)}, k=[${p.bodyClose},${p.bodyFar},${p.flankClose}], e=${EMPTY.toFixed(0)}, f=${FRIENDLY.toFixed(0)}, c=${COMMIT.toFixed(2)})`,
  });
}

// Variant that takes a flat 25-element kernel directly (East-facing,
// row-major: index = (dy + 2) * 5 + (dx + 2)). The kernel is rotated
// to four cardinals at construction. Use this when the GA is
// optimizing the full weight matrix, not just a few constants.
//
// MATRIX_SCHEMA (below) describes the search space: a 25-length
// array knob plus the four scalar knobs (attackerBonus, emptyBonus,
// friendlyPenalty, commitThreshold). The center cell is included
// in the array for index simplicity but contributes nothing because
// no army moves "into itself."
export const MATRIX_SCHEMA = Object.freeze({
  attackerBonus:    { min: 1.0, max: 1.7, sigma: 0.04 },
  emptyBonus:       { min: 0,   max: 60,  sigma: 4 },
  friendlyPenalty:  { min: -40, max: 0,   sigma: 4 },
  commitThreshold:  { min: 0.0, max: 1.5, sigma: 0.1 },
  kernel:           { length: 25, min: -3, max: 3, sigma: 0.3 },
});

export const MATRIX_DEFAULTS = Object.freeze({
  attackerBonus: 1.4,
  emptyBonus: 20,
  friendlyPenalty: -10,
  commitThreshold: 0.5,
  // Default kernel reproduces the original Spearhead East pattern:
  // body-behind on axis (3 at [0,-1], 1 at [0,-2]), rear flanks (1
  // at [-1,-1] and [1,-1]). All other cells 0.
  kernel: (() => {
    const k = new Array(25).fill(0);
    const idx = (dy, dx) => (dy + 2) * 5 + (dx + 2);
    k[idx(0, -1)] = 3;
    k[idx(0, -2)] = 1;
    k[idx(-1, -1)] = 1;
    k[idx(1, -1)] = 1;
    return Object.freeze(k);
  })(),
});

function rotateKernelOffsets(kernel) {
  // For each direction (0=W, 1=E, 2=N, 3=S) build a flat list
  // [stencilIdx, weight, stencilIdx, weight, ...] of non-zero
  // contributions. Zero weights are skipped for speed.
  function rotateXY(dy, dx, dir) {
    switch (dir) {
      case 0: return [dy, -dx];
      case 1: return [dy, dx];
      case 2: return [-dx, dy];
      case 3: return [dx, -dy];
    }
    return [dy, dx];
  }
  const out = [[], [], [], []];
  for (let i = 0; i < 25; i++) {
    const w = kernel[i];
    if (w === 0) continue;
    const dy = ((i / 5) | 0) - 2;
    const dx = (i % 5) - 2;
    if (dy === 0 && dx === 0) continue; // center has no meaning
    for (let dir = 0; dir < 4; dir++) {
      const [rdy, rdx] = rotateXY(dy, dx, dir);
      const idx = (rdy + 2) * 5 + (rdx + 2);
      if (idx < 0 || idx >= 25) continue;
      out[dir].push(idx, w);
    }
  }
  return out;
}

export function makeSpearheadFromKernel(params = {}) {
  const p = { ...MATRIX_DEFAULTS, ...params };
  const name = params.name ?? "MatrixSpearhead";
  const OFFSETS = rotateKernelOffsets(p.kernel);
  const nonzero = p.kernel.reduce((n, w) => n + (w !== 0 ? 1 : 0), 0);
  return spearheadFromOffsets({
    name, OFFSETS,
    ATTACKER_BONUS: p.attackerBonus,
    COMMIT: p.commitThreshold,
    EMPTY: p.emptyBonus,
    FRIENDLY: p.friendlyPenalty,
    description: `Matrix Spearhead (ab=${p.attackerBonus.toFixed(2)}, ${nonzero}/25 cells nonzero, e=${p.emptyBonus.toFixed(0)}, f=${p.friendlyPenalty.toFixed(0)}, c=${p.commitThreshold.toFixed(2)})`,
  });
}

// As makeSpearheadFromKernel, but additionally takes a `tech` knob:
// a 5-element array [move, stack, prod, atk, def]. Returns a lineup
// entry { strategy, tech, name } that runMatch will honor. The tech
// array gets normalized to non-negative integers summing to exactly
// 100 (the engine's hard requirement). All-zero or negative input
// falls back to neutral [20, 20, 20, 20, 20].
const TECH_KEYS = ["move", "stack", "prod", "atk", "def"];

export function normalizeTechArray(arr) {
  let clipped = arr.map((x) => Math.max(0, x));
  let sum = clipped.reduce((s, x) => s + x, 0);
  if (sum <= 0) return [20, 20, 20, 20, 20];
  let scaled = clipped.map((x) => Math.round((x * 100) / sum));
  let total = scaled.reduce((s, x) => s + x, 0);
  // Distribute rounding error onto the largest cells.
  while (total !== 100) {
    if (total < 100) {
      let bestIdx = 0;
      for (let i = 1; i < 5; i++) if (scaled[i] > scaled[bestIdx]) bestIdx = i;
      scaled[bestIdx]++;
      total++;
    } else {
      let bestIdx = -1; let bestVal = 0;
      for (let i = 0; i < 5; i++) if (scaled[i] > bestVal) { bestVal = scaled[i]; bestIdx = i; }
      if (bestIdx < 0) break;
      scaled[bestIdx]--;
      total--;
    }
  }
  return scaled;
}

function arrayToTech(arr) {
  const t = {};
  for (let i = 0; i < TECH_KEYS.length; i++) t[TECH_KEYS[i]] = arr[i];
  return t;
}

export const MATRIX_TECH_DEFAULTS = Object.freeze({
  ...MATRIX_DEFAULTS,
  tech: Object.freeze([20, 20, 20, 20, 20]), // neutral
});

export const MATRIX_TECH_SCHEMA = Object.freeze({
  ...MATRIX_SCHEMA,
  tech: { length: 5, min: 0, max: 50, sigma: 4, int: true },
});

export function makeSpearheadFromKernelWithTech(params = {}) {
  const p = { ...MATRIX_TECH_DEFAULTS, ...params };
  const name = params.name ?? "MatrixTechSpearhead";
  const strategy = makeSpearheadFromKernel({ ...p, name });
  const techArr = normalizeTechArray(p.tech);
  return { strategy, tech: arrayToTech(techArr), name };
}

// Shared act() body. Kept private so both variant constructors share
// exactly the same control flow; only the OFFSETS / scalars differ.
function spearheadFromOffsets({ name, OFFSETS, ATTACKER_BONUS, COMMIT, EMPTY, FRIENDLY, description }) {
  return {
    name,
    author: "ga",
    version: 1,
    description,
    act(army, game) {
      const tile = army.tile;
      if (!tile) return;
      const neighbors = tile.neighbors;
      const pid = army.player.id;
      const myEff = army.attackPower * ATTACKER_BONUS;

      let bestKill = null;
      let bestKillStr = -1;
      const neighborInfo = [null, null, null, null];
      for (let i = 0; i < 4; i++) {
        const t = neighbors[i];
        if (!t) continue;
        const armies = t.armies;
        let enemy = 0;
        let friendly = false;
        for (let k = 0; k < armies.length; k++) {
          const a = armies[k];
          if (a.player.id === pid) { friendly = true; break; }
          enemy += a.strength;
        }
        neighborInfo[i] = { friendly, enemy, empty: armies.length === 0 };
        if (friendly || enemy <= 0) continue;
        if (myEff <= enemy) continue;
        if (enemy > bestKillStr) { bestKillStr = enemy; bestKill = t; }
      }
      if (bestKill) {
        army.attack(bestKill, army.attackPower);
        return;
      }

      if (!tile.stencil5) {
        Trinity.act(army, game);
        return;
      }
      const stencil = tile.stencil5;
      const viewer = army.player;
      let bestDir = -1;
      let bestScore = -Infinity;
      for (let k = 0; k < 4; k++) {
        const target = neighbors[k];
        if (!target) continue;
        const info = neighborInfo[k];
        if (info && !info.friendly && info.enemy > 0 && myEff <= info.enemy) continue;

        const offs = OFFSETS[k];
        let score = 0;
        for (let n = 0; n < offs.length; n += 2) {
          const t = stencil[offs[n]];
          if (!t) continue;
          score += offs[n + 1] * sumStrength(t.armies, viewer);
        }
        if (info) {
          if (info.empty) score += EMPTY;
          else if (info.friendly) score += FRIENDLY;
        }
        if (score > bestScore) { bestScore = score; bestDir = k; }
      }
      if (bestDir < 0) {
        SlowAndSteady.act(army, game);
        return;
      }
      const power = army.attackPower;
      if (power > COMMIT) army.attack(neighbors[bestDir], power);
    },
  };
}
