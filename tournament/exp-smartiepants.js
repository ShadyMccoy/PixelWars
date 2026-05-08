#!/usr/bin/env node
// exp-smartiepants.js
//
// Smartiepants stress test: 5000 matches across 8 in-memory variants of
// the bot (genome + field perturbations) plus 4 weak baselines, on the
// lab1 map at K=5. Variants live only in this script — they are NOT
// registered in src/strategies/index.js, so the permanent bot list is
// untouched.
//
// Genome variants reuse the standard featurize. Field variants build a
// custom feature vector (different K) and pair it with a fresh weight
// matrix at the matching shape, so the matrix multiplication still
// works. All variants run through the same forward/argmax kernel.
//
// Output: per-bot PL ratings (Elo-scaled), avg place, win rate.

import { runMatch } from "./arena.js";
import { fitPlackettLuce } from "./plackettLuce.js";
import { MAPS } from "./maps.js";
import { getStrategy } from "../src/strategies/index.js";
import {
  DIRECTIONS,
  FEATURE_COUNT,
  QUADRANT_CELLS,
  featurize,
} from "../src/core/featurize.js";
import { argmax, forward } from "../src/core/nn.js";
import Smartiepants from "../src/strategies/Smartiepants.js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// -----------------------------------------------------------------------------
// Reproducible RNG (xorshift32) for genome perturbations.
// -----------------------------------------------------------------------------
function makeRng(seed) {
  let s = seed >>> 0;
  if (s === 0) s = 0xdeadbeef;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}
function gaussian(rng) {
  // Box-Muller; stateless across calls (returns a single sample).
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// -----------------------------------------------------------------------------
// Genome variants — same featurize, different weight matrices.
// -----------------------------------------------------------------------------
const SEED_W = Smartiepants.weights;

function jitter(W, sigma, seed) {
  const rng = makeRng(seed);
  const out = new Float32Array(W.length);
  for (let i = 0; i < W.length; i++) out[i] = W[i] + sigma * gaussian(rng);
  return out;
}
function randomW(K, N, sigma, seed) {
  const rng = makeRng(seed);
  const out = new Float32Array(K * N);
  for (let i = 0; i < out.length; i++) out[i] = sigma * gaussian(rng);
  return out;
}
function zeroW(K, N) { return new Float32Array(K * N); }

function makeBot(name, weights, featurizeFn, K) {
  const featBuf = new Float32Array(K);
  const scoreBuf = new Float32Array(DIRECTIONS);
  return {
    name,
    author: "exp-smartiepants",
    version: 1,
    description: `Smartiepants variant: ${name}`,
    weights,
    act(army) {
      const tile = army.tile;
      if (!tile) return;
      const x = featurizeFn(army, featBuf);
      forward(x, weights, scoreBuf, K, DIRECTIONS);
      const dir = argmax(scoreBuf, DIRECTIONS);
      const target = tile.neighbors[dir];
      if (target) army.attack(target, army.attackPower);
    },
  };
}

// -----------------------------------------------------------------------------
// Field (featurize) variants. Each returns its K (input dim).
// -----------------------------------------------------------------------------

// Quadrant-only field: 4 dirs × 2 channels + self + bias = 10 features.
const QUADONLY_K = 4 * 2 + 1 + 1;
function featurize_quadonly(army, out) {
  out.fill(0);
  const tile = army.tile;
  if (!tile) return out;
  const stencil = tile.stencil5;
  const vid = army.player.id;
  // Quadrant sums directly from stencil.
  for (let d = 0; d < 4; d++) {
    const cells = QUADRANT_CELLS[d];
    let f = 0, e = 0;
    for (let i = 0; i < cells.length; i++) {
      const t = stencil[cells[i]];
      if (!t) continue;
      const armies = t.armies;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === vid) f += a.strength;
        else e += a.strength;
      }
    }
    out[2 * d] = f;
    out[2 * d + 1] = e;
  }
  out[8] = army.maxStrength > 0 ? army.strength / army.maxStrength : 0;
  out[9] = 1;
  return out;
}

// Inner-3x3 field: only the 9 closest cells (radius 1) × 2 channels +
// self + bias = 20 features. Strictly local view.
// Stencil5 layout: row-major over (di+2, dj+2) in [0..4]², so the
// inner 3x3 is rows 1..3 × cols 1..3.
const INNER3_INDICES = (() => {
  const out = [];
  for (let row = 1; row <= 3; row++) for (let col = 1; col <= 3; col++) out.push(row * 5 + col);
  return out;
})();
const INNER3_K = 9 * 2 + 1 + 1;
function featurize_inner3(army, out) {
  out.fill(0);
  const tile = army.tile;
  if (!tile) return out;
  const stencil = tile.stencil5;
  const vid = army.player.id;
  for (let i = 0; i < INNER3_INDICES.length; i++) {
    const t = stencil[INNER3_INDICES[i]];
    if (!t) continue;
    let f = 0, e = 0;
    const armies = t.armies;
    for (let k = 0; k < armies.length; k++) {
      const a = armies[k];
      if (a.player.id === vid) f += a.strength;
      else e += a.strength;
    }
    out[2 * i] = f;
    out[2 * i + 1] = e;
  }
  out[18] = army.maxStrength > 0 ? army.strength / army.maxStrength : 0;
  out[19] = 1;
  return out;
}

// -----------------------------------------------------------------------------
// Build the 8 Smartiepants variants.
// -----------------------------------------------------------------------------
//
// Genome variants use the standard FEATURE_COUNT featurize.
// Field variants use a smaller K and matched weight matrix.
// All variants share the same forward+argmax decision rule.

const variants = [
  makeBot("SP_seed",       SEED_W,                                  featurize, FEATURE_COUNT),
  makeBot("SP_jitter01",   jitter(SEED_W, 0.1, 0xa1),               featurize, FEATURE_COUNT),
  makeBot("SP_jitter05",   jitter(SEED_W, 0.5, 0xa2),               featurize, FEATURE_COUNT),
  makeBot("SP_random",     randomW(FEATURE_COUNT, DIRECTIONS, 0.3, 0xa3), featurize, FEATURE_COUNT),
  makeBot("SP_zero",       zeroW(FEATURE_COUNT, DIRECTIONS),        featurize, FEATURE_COUNT),
  // Field perturbations: smaller K, fresh weights at matching shape.
  makeBot("SP_quadonly_seed",   makeQuadonlySeed(),                 featurize_quadonly, QUADONLY_K),
  makeBot("SP_quadonly_jitter", jitter(makeQuadonlySeed(), 0.3, 0xb1), featurize_quadonly, QUADONLY_K),
  makeBot("SP_inner3_jitter",   randomW(INNER3_K, DIRECTIONS, 0.3, 0xb2), featurize_inner3, INNER3_K),
];

function makeQuadonlySeed() {
  // Direct prior: each direction's quadrant-channel pair pushes its way.
  const W = new Float32Array(QUADONLY_K * DIRECTIONS);
  for (let d = 0; d < 4; d++) {
    W[(2 * d) * DIRECTIONS + d] = 1;        // friendly in dir d → score d
    W[(2 * d + 1) * DIRECTIONS + d] = -1;   // enemy in dir d → discourage
  }
  return W;
}

// Re-build variants now that makeQuadonlySeed is reachable (it is, since
// JS hoists function declarations; the array above already grabbed it).
// (No-op kept here as a reminder for readers.)

// -----------------------------------------------------------------------------
// Pool: 8 variants + 4 weak baselines.
// -----------------------------------------------------------------------------
const baselines = ["Random", "Defender", "Cautious", "Berserker"].map(getStrategy);
const POOL = [...variants, ...baselines];
const POOL_NAMES = POOL.map((s) => s.name);

// -----------------------------------------------------------------------------
// Run N pool matches at K=5 on lab1.
// -----------------------------------------------------------------------------
const argv = process.argv.slice(2);
const N_MATCHES = (() => {
  const i = argv.indexOf("--matches");
  if (i >= 0) return Number(argv[i + 1]);
  return 5000;
})();
const K_PER_MATCH = MAPS.lab1.players; // 5
const map = MAPS.lab1;

console.log(`pool size=${POOL.length}, K=${K_PER_MATCH}, matches=${N_MATCHES}`);
console.log("variants:", variants.map(v => v.name).join(", "));
console.log("baselines:", baselines.map(b => b.name).join(", "));

const orderings = [];
const stats = new Map(POOL_NAMES.map((n) => [n, {
  plays: 0, wins: 0, sumPlace: 0, sumTerr: 0, survives: 0, eliminations: 0,
}]));

const rng = makeRng(42);
function pickK(k) {
  // Sample without replacement.
  const arr = POOL.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, k);
}

const t0 = Date.now();
for (let m = 0; m < N_MATCHES; m++) {
  const lineup = pickK(K_PER_MATCH);
  const positions = map.positions(K_PER_MATCH);
  const result = runMatch({
    strategies: lineup,
    mapConfig: map.config,
    startPositions: positions,
    seed: 1000 + m,
    maxTicks: 4000,
  });
  const ranking = result.ranking;
  const order = ranking.map((r) => r.strategy);
  orderings.push(order);
  for (let i = 0; i < ranking.length; i++) {
    const r = ranking[i];
    const s = stats.get(r.strategy);
    s.plays += 1;
    s.sumPlace += i;
    s.sumTerr += r.territory;
    if (r.survived) s.survives += 1;
    if (i === 0 && r.survived) s.wins += 1;
    if (!r.survived) s.eliminations += 1;
  }
  if ((m + 1) % 500 === 0) {
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`  ${m + 1}/${N_MATCHES} matches @ ${sec}s\n`);
  }
}
const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`done in ${totalSec}s`);

// -----------------------------------------------------------------------------
// PL ratings (Elo-scaled).
// -----------------------------------------------------------------------------
const pl = fitPlackettLuce(orderings, { prior: 0.5, winBoost: 0 });
const ELO_SCALE = 400 / Math.log(10);
const skill = pl.skill;
// Normalize: shift mean to 1500.
const skillVals = Object.values(skill);
const meanLogSkill = skillVals.reduce((s, v) => s + Math.log(v), 0) / skillVals.length;
const ratings = {};
for (const [name, s] of Object.entries(skill)) {
  ratings[name] = 1500 + ELO_SCALE * (Math.log(s) - meanLogSkill);
}

// -----------------------------------------------------------------------------
// Report.
// -----------------------------------------------------------------------------
const rows = POOL_NAMES.map((name) => {
  const s = stats.get(name);
  return {
    name,
    rating: ratings[name] ?? 0,
    plays: s.plays,
    win: s.wins,
    winRate: s.plays ? s.wins / s.plays : 0,
    avgPlace: s.plays ? s.sumPlace / s.plays + 1 : 0, // 1-indexed
    avgTerr: s.plays ? s.sumTerr / s.plays : 0,
    surviveRate: s.plays ? s.survives / s.plays : 0,
    elimRate: s.plays ? s.eliminations / s.plays : 0,
  };
}).sort((a, b) => b.rating - a.rating);

console.log("");
console.log("Final standings (sorted by PL rating):");
console.log("  rating  avgPlace  win%   surv%   plays  name");
console.log("  ------  --------  -----  ------  -----  --------------");
for (const r of rows) {
  console.log(
    `  ${r.rating.toFixed(0).padStart(6)}    ${r.avgPlace.toFixed(2)}     ` +
    `${(r.winRate * 100).toFixed(1).padStart(4)}%  ${(r.surviveRate * 100).toFixed(1).padStart(5)}%  ` +
    `${String(r.plays).padStart(5)}  ${r.name}`
  );
}

// Persist for inspection.
const outPath = resolve(import.meta.dirname ?? ".", "exp-smartiepants.json");
writeFileSync(outPath, JSON.stringify({
  config: { matches: N_MATCHES, k: K_PER_MATCH, map: "lab1", pool: POOL_NAMES },
  rows,
  generatedAt: new Date().toISOString(),
}, null, 2));
console.log(`\nwrote ${outPath}`);
