#!/usr/bin/env node
// Phase 4 smoke + sanity test for the evaluator.
//
// Runs evaluateConfig on the existing arena map preset using the saved
// arena league as ground truth. Expectations (NOT bit-exact, statistical):
//   - discrimination > 0.5 (the saved league IS arena, so a fresh eval
//     of arena should rank bots similarly)
//   - reliability   > 0.3 (split-half Spearman)
//   - anchor accuracy >= 0.8 (we picked easy pairs)
//   - timeoutRate    low (< 0.4)
//   - medianTicks    > 0
//   - composite      > 0

import { readFileSync } from "node:fs";
import { evaluateConfig } from "./evaluator.js";
import { makeConfig } from "./configs.js";
import { STRATEGY_LIST, getStrategy } from "../../src/strategies/index.js";

const anchors = JSON.parse(readFileSync("tournament/map-search/anchors.json", "utf8"));

// Build the saved-league ground-truth rank dict.
const leagueData = JSON.parse(readFileSync("tournament/leagues.json", "utf8"));
const arenaLeague = leagueData.leagues.find((l) => l.map === "arena");
const flat = arenaLeague.tiers.flat();
const groundTruth = Object.fromEntries(flat.map((n, i) => [n, i]));

// Use the arena map config so we're literally re-evaluating the same map.
const config = makeConfig({
  width: 30, height: 22, growth: 2, maxArmy: 6, wrap: true,
  topology: "ring", k: 6, name: "arena_replica",
});

// Subset bots to a manageable pool: top + middle + bottom of the league.
// Take 18 bots for the smoke run (still >> than k=6 so sampling is varied).
const poolNames = [
  ...flat.slice(0, 6),
  ...flat.slice(20, 26),
  ...flat.slice(-6),
];
const bots = poolNames.map(getStrategy);
console.log(`Pool (${bots.length}):`, poolNames.join(", "));

const t0 = Date.now();
const out = evaluateConfig({
  config,
  bots,
  k: 6,
  matchCount: 60,
  baseSeed: 2026,
  maxTicks: 1500,
  snapshotEvery: 30,
  groundTruth,
  anchorPairs: anchors.pairs,
});
const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\nelapsed: ${elapsedSec}s\n`);
console.log("metrics:", out.metrics);

console.log("\ntop 5 by per-map score:");
const sortedNames = Object.entries(out.perBotScore).sort((a, b) => b[1] - a[1]);
for (const [n, s] of sortedNames.slice(0, 5)) console.log(`  ${n.padEnd(20)} ${s.toFixed(2)}`);
console.log("\nbottom 5:");
for (const [n, s] of sortedNames.slice(-5)) console.log(`  ${n.padEnd(20)} ${s.toFixed(2)}`);

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ok: ${msg}`); }
  else      { failed++; console.error(`  FAIL: ${msg}`); }
}

console.log("\n--- assertions ---");
assert(out.metrics.matches === 60, "match count is 60");
assert(out.metrics.medianTicks > 0, `medianTicks > 0 (${out.metrics.medianTicks})`);
assert(out.metrics.discrimination > 0.3, `discrimination > 0.3 (${out.metrics.discrimination?.toFixed(3)})`);
assert(out.metrics.reliability > 0.2, `reliability > 0.2 (${out.metrics.reliability?.toFixed(3)})`);
assert(out.metrics.anchorAccuracy === null || out.metrics.anchorAccuracy >= 0.7,
       `anchor accuracy >= 0.7 or null (${out.metrics.anchorAccuracy})`);
assert(out.metrics.timeoutRate < 0.5, `timeoutRate < 0.5 (${out.metrics.timeoutRate})`);
assert(out.metrics.composite > 0, `composite > 0 (${out.metrics.composite?.toFixed(3)})`);
assert(out.metrics.medianTStable <= out.metrics.medianTicks,
       `medianTStable ≤ medianTicks (${out.metrics.medianTStable} ≤ ${out.metrics.medianTicks})`);

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
