#!/usr/bin/env node
// Validation harness for the map-search pipeline. Three checks:
//
//   1. Planted-degenerate sanity: the planted bad configs should land in
//      the bottom half of the combined ranking. If they sneak into the
//      top, something in the metric or evaluator is broken.
//
//   2. Anchor swap: re-rank using altPairs instead of pairs. Because
//      anchorPairs only contributes to the metric reporting (it's not
//      part of `composite`), this mainly cross-checks the per-config
//      anchor accuracy is consistent across stylistic anchor choices.
//
//   3. Top-K reproducibility: run pass 2 a second time with a different
//      base seed; the top-3 by composite score should overlap with the
//      first run by ≥2 (Jaccard ≥ 0.5). Catches configs whose score is
//      noise-driven.
//
// Usage:
//   node tournament/map-search/validate.js [--seeds N] [--small]

import { readFileSync } from "node:fs";
import { evaluateConfig, composite } from "./evaluator.js";
import { defaultGrid, smallGrid, planted } from "./configs.js";
import { getStrategy, STRATEGY_LIST } from "../../src/strategies/index.js";

const args = process.argv.slice(2);
const seedBudget = parseInt(args[args.indexOf("--seeds") + 1] ?? "40", 10);
const useSmall = args.includes("--small");
const maxTicks = 1200;

const grid = useSmall
  ? [...smallGrid(), ...planted()]
  : [...smallGrid(), ...planted()];   // for now keep validate light

const data = JSON.parse(readFileSync("tournament/leagues.json", "utf8"));
const arenaLeague = data.leagues.find((l) => l.map === "arena");
const flat = arenaLeague.tiers.flat();
const groundTruth = Object.fromEntries(flat.map((n, i) => [n, i]));

const anchors = JSON.parse(readFileSync("tournament/map-search/anchors.json", "utf8"));

const mid = Math.floor(flat.length / 2);
const botNames = [...new Set([
  ...flat.slice(0, 8),
  ...flat.slice(mid - 3, mid + 3),
  ...flat.slice(-6),
])];
const bots = botNames.map(getStrategy);

console.log(`Validation: ${grid.length} configs (${planted().length} planted), bots=${bots.length}, seeds=${seedBudget}`);

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ok: ${msg}`); }
  else      { failed++; console.error(`  FAIL: ${msg}`); }
}

function rankConfigs(grid, baseSeed, anchorPairs) {
  const out = [];
  for (const cfg of grid) {
    const k = Math.min(cfg.spec.k ?? 4, bots.length);
    const ev = evaluateConfig({
      config: cfg, bots, k,
      matchCount: seedBudget, baseSeed, maxTicks,
      snapshotEvery: 25,
      groundTruth,
      anchorPairs,
      splitHalfReliability: true,
    });
    out.push({ name: cfg.name, score: composite(ev.metrics), metrics: ev.metrics, isPlant: cfg.name.startsWith("PLANT_") });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

const t0 = Date.now();
console.log(`\n--- Run A (default anchors, baseSeed=2026) ---`);
const runA = rankConfigs(grid, 2026, anchors.pairs);
runA.forEach((r, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. ${r.name.padEnd(34)} score=${r.score.toFixed(3)} ${r.isPlant ? "[PLANT]" : ""} ` +
    `disc=${r.metrics.discrimination?.toFixed(2)} rel=${r.metrics.reliability?.toFixed(2)} anc=${r.metrics.anchorAccuracy?.toFixed(2) ?? "-"}`);
});

console.log(`\n--- Run B (alt anchors, baseSeed=4051) ---`);
const runB = rankConfigs(grid, 4051, anchors.altPairs);
runB.forEach((r, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. ${r.name.padEnd(34)} score=${r.score.toFixed(3)} ${r.isPlant ? "[PLANT]" : ""} ` +
    `disc=${r.metrics.discrimination?.toFixed(2)} rel=${r.metrics.reliability?.toFixed(2)} anc=${r.metrics.anchorAccuracy?.toFixed(2) ?? "-"}`);
});

console.log(`\nelapsed: ${((Date.now() - t0) / 1000).toFixed(0)}s`);

// ---- check 1: planted configs in bottom half ----
console.log(`\n--- check 1: planted configs in bottom half ---`);
for (const r of runA) {
  if (!r.isPlant) continue;
  const rank = runA.indexOf(r) + 1;
  const N = runA.length;
  assert(rank > N / 2, `${r.name}: rank ${rank}/${N} (must be > ${N / 2})`);
}

// ---- check 2: top-3 overlap between runs (different seeds + anchors) ----
console.log(`\n--- check 2: top-3 overlap across runs ---`);
const topA = new Set(runA.slice(0, 3).map((r) => r.name));
const topB = new Set(runB.slice(0, 3).map((r) => r.name));
const overlap = [...topA].filter((n) => topB.has(n)).length;
assert(overlap >= 2, `top-3 overlap=${overlap} (≥2 means stable; <2 suggests metric is noisy)`);
console.log(`    runA top-3: ${[...topA].join(", ")}`);
console.log(`    runB top-3: ${[...topB].join(", ")}`);

// ---- check 3: anchor accuracy is high on top configs ----
console.log(`\n--- check 3: top-3 of run A has high anchor accuracy ---`);
for (const r of runA.slice(0, 3)) {
  const a = r.metrics.anchorAccuracy;
  assert(a == null || a >= 0.7, `${r.name}: anchor=${a?.toFixed(2) ?? "(none)"} should be ≥ 0.7`);
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
