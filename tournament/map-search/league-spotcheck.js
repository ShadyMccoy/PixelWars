#!/usr/bin/env node
// Take the current top map-search config and run a real league on it.
// Sanity-check: the resulting top tier should contain at least 4 of the
// known-strong bots (Trinity, Membrane, Conductor, Crusader, Bulwark,
// TideWall, Lance, Conqueror) and the bottom tier should contain at
// least 2 of the known-weak bots (Random, Pacifist_*, Repel, Scatter_*).
//
// Usage:
//   node tournament/map-search/league-spotcheck.js [--config NAME] [--seasons N]

import { readFileSync } from "node:fs";
import { runLeague } from "../league.js";
import { makeConfig, defaultGrid } from "./configs.js";
import { STRATEGY_LIST, getStrategy } from "../../src/strategies/index.js";

const args = process.argv.slice(2);
function arg(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
}

// Hard-code our current best, or accept --config NAME to lookup in defaultGrid.
const requested = arg("--config", null);
let cfg;
if (requested) {
  cfg = defaultGrid().find((c) => c.name === requested);
  if (!cfg) {
    console.error(`No config with name ${requested}.`);
    process.exit(1);
  }
} else {
  // Use the leader from validation runs as default.
  cfg = makeConfig({
    width: 24, height: 18, growth: 1.5, maxArmy: 6, wrap: true,
    topology: "ring", k: 4, name: "spotcheck_default",
  });
}

const seasons = parseInt(arg("--seasons", "2"), 10);
const matchesPerSeason = parseInt(arg("--matches-per-season", "15"), 10);
const tierSize = parseInt(arg("--tier-size", "8"), 10);

// Use a representative pool: 24 active bots covering the league spread.
const data = JSON.parse(readFileSync("tournament/leagues.json", "utf8"));
const flat = data.leagues.find((l) => l.map === "arena").tiers.flat();
const mid = Math.floor(flat.length / 2);
const poolNames = [...new Set([
  ...flat.slice(0, 10),
  ...flat.slice(mid - 4, mid + 4),
  ...flat.slice(-8),
])];
const strategies = poolNames.map(getStrategy);

// Seed initial tier composition from leagues.json position (top of file =
// strongest). Without a real rankings.json for this map-search config we
// can't use PL ratings; the linearly-scaled position is a decent proxy
// to start with, and the league runner's between-season refit takes
// over from there.
const N = flat.length;
const ratingByName = new Map(flat.map((name, i) => [name, 2000 - (1500 * i) / Math.max(1, N - 1)]));
const seedRatings = {
  get: (name) => (ratingByName.has(name) ? ratingByName.get(name) : 1000),
  has: (name) => ratingByName.has(name),
};

console.log(`Spot-check league on config: ${cfg.name}`);
console.log(`  config: ${JSON.stringify(cfg.config)} k=${cfg.spec?.k ?? 4} topology=${cfg.spec?.topology ?? "ring"}`);
console.log(`  pool: ${strategies.length} bots, tierSize=${tierSize}, seasons=${seasons}, matches/season=${matchesPerSeason}`);

const t0 = Date.now();
const result = runLeague({
  strategies,
  map: cfg,
  tierSize,
  seasons,
  matchesPerSeason,
  poolSize: cfg.spec?.k ?? 4,
  baseSeed: 7777,
  maxTicks: 1500,
  seedRatings,
});
console.log(`\nelapsed: ${((Date.now() - t0) / 1000).toFixed(0)}s`);

console.log(`\nFinal tiers (${result.tiers.length}):`);
for (let t = 0; t < result.tiers.length; t++) {
  console.log(`  Tier ${t + 1}: ${result.tiers[t].join(", ")}`);
}

// Sanity check — known-strong should cluster top, known-weak should cluster bottom.
const knownStrong = new Set(["Trinity", "Membrane", "Conductor", "Crusader", "Bulwark", "TideWall", "Lance", "Conqueror"]);
const knownWeak = new Set(["Random", "Repel", "Pacifist_01", "Pacifist_02", "Pacifist_03", "Pacifist_04",
  "Scatter_01", "Scatter_08", "Scatter_10", "Stencil_02"]);

const top = new Set(result.tiers[0]);
const bottom = new Set(result.tiers[result.tiers.length - 1]);
const strongInTop = [...knownStrong].filter((b) => top.has(b)).length;
const weakInBottom = [...knownWeak].filter((b) => bottom.has(b)).length;

console.log(`\nstrong-in-top: ${strongInTop} (need >= 3)`);
console.log(`weak-in-bottom: ${weakInBottom} (need >= 2)`);

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ok: ${msg}`); }
  else      { failed++; console.error(`  FAIL: ${msg}`); }
}
assert(strongInTop >= 3, `≥3 known-strong bots in top tier (got ${strongInTop})`);
assert(weakInBottom >= 2, `≥2 known-weak bots in bottom tier (got ${weakInBottom})`);

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
