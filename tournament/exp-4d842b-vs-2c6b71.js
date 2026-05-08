#!/usr/bin/env node
// Head-to-head investigation: Conqueror_g8_4d842b (top-rated) vs
// Conqueror_g8_2c6b71 (rank #23). User reports 4d842b "always loses"
// to 2c6b71 on a custom 45x45 g1.2 m12 wrap map with the lineup
// captured in https://pixlwars.win/?w=45&h=45&g=1.2&m=12&wrap=1&seed=88242417&bots=...
//
// This script is a data-collection harness only — no source-code peek
// at either bot. It runs the matchup at varying lineup sizes, seeds,
// seat assignments, and map parameters, and emits per-match outcomes.

import { runMatch } from "./arena.js";
import { getStrategy } from "../src/strategies/index.js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const A = "Conqueror_g8_4d842b";   // top-rated, the "should win"
const B = "Conqueror_g8_2c6b71";   // lower-rated, the "always wins"

// Map + lineup from the user's reproduction URL.
const BASE_MAP = { width: 45, height: 45, growth: 1.2, maxArmy: 12, wrap: true };
const BASE_LINEUP = [
  "Conqueror_g8_4d842b",
  "Conqueror_g10_e067cc",
  "Conqueror_g8_2c6b71",
  "Conqueror_g6_15ea9a",
  "Conqueror_g2_6b59e8",
  "Conqueror_g9_c81d7f",
];
const BASE_POSITIONS = [
  { x: 11, y:  8, strength: 1 },
  { x: 34, y:  8, strength: 1 },
  { x: 11, y: 23, strength: 1 },
  { x: 34, y: 23, strength: 1 },
  { x: 11, y: 38, strength: 1 },
  { x: 34, y: 38, strength: 1 },
];

const FIXED_SEED = 88242417;
const N_SEEDS = 30; // how many seeds to sweep per condition

function lineupPositions(n, mapCfg) {
  // Even 2-column grid on the torus. Mirrors the user's URL but
  // generalizes to any K from 2..6.
  if (n <= BASE_POSITIONS.length) {
    // For K<6 we pick K positions roughly opposite each other so the
    // matchup isn't decided by clustering one side.
    if (n === 2) return [BASE_POSITIONS[0], BASE_POSITIONS[3]];
    if (n === 3) return [BASE_POSITIONS[0], BASE_POSITIONS[3], BASE_POSITIONS[4]];
    if (n === 4) return [BASE_POSITIONS[0], BASE_POSITIONS[1], BASE_POSITIONS[4], BASE_POSITIONS[5]];
    if (n === 5) return BASE_POSITIONS.slice(0, 5);
    return BASE_POSITIONS.slice(0, n);
  }
  throw new Error(`No positions for n=${n}`);
}

function placeForSize(mapCfg, n) {
  // 2-column even grid on the torus; reused for the map-param sweep.
  const cols = Math.min(2, n);
  const rows = Math.ceil(n / cols);
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = Math.round(mapCfg.width * (c + 0.5) / cols) % mapCfg.width;
    const y = Math.round(mapCfg.height * (r + 0.5) / rows) % mapCfg.height;
    out.push({ x, y, strength: 1 });
  }
  return out;
}

function runOne({ lineup, mapConfig, startPositions, seed, maxTicks = 4000 }) {
  const strategies = lineup.map((n) => getStrategy(n));
  const result = runMatch({ strategies, mapConfig, startPositions, seed, maxTicks });
  // Map ranking back to per-name finish info.
  const byName = {};
  for (const r of result.ranking) {
    byName[r.strategy] = {
      place: result.ranking.indexOf(r),
      survived: r.survived,
      territory: r.territory,
      strength: r.strength,
      eliminatedAt: r.eliminatedAt,
    };
  }
  return {
    seed,
    ticks: result.ticks,
    endReason: result.endReason,
    stalemate: result.stalemate ?? false,
    winner: result.ranking[0]?.strategy,
    aPlace: byName[A]?.place,
    bPlace: byName[B]?.place,
    aTerr: byName[A]?.territory ?? 0,
    bTerr: byName[B]?.territory ?? 0,
    aElim: byName[A]?.eliminatedAt,
    bElim: byName[B]?.eliminatedAt,
  };
}

function summarize(label, runs) {
  const n = runs.length;
  const aWins = runs.filter((r) => r.winner === A).length;
  const bWins = runs.filter((r) => r.winner === B).length;
  const aBetter = runs.filter((r) => r.aPlace < r.bPlace).length;
  const bBetter = runs.filter((r) => r.bPlace < r.aPlace).length;
  const tied = n - aBetter - bBetter;
  const stalemates = runs.filter((r) => r.stalemate).length;
  const meanTicks = runs.reduce((s, r) => s + r.ticks, 0) / n;
  console.log(`\n=== ${label} (n=${n}) ===`);
  console.log(`  A=${A} wins:        ${aWins}/${n}  (${(100 * aWins / n).toFixed(0)}%)`);
  console.log(`  B=${B} wins:        ${bWins}/${n}  (${(100 * bWins / n).toFixed(0)}%)`);
  console.log(`  A finishes ahead of B: ${aBetter}/${n}  (${(100 * aBetter / n).toFixed(0)}%)`);
  console.log(`  B finishes ahead of A: ${bBetter}/${n}  (${(100 * bBetter / n).toFixed(0)}%)`);
  console.log(`  tied (same place):     ${tied}/${n}`);
  console.log(`  stalemates:            ${stalemates}/${n}`);
  console.log(`  mean ticks:            ${meanTicks.toFixed(0)}`);
  return { label, n, aWins, bWins, aBetter, bBetter, tied, stalemates, meanTicks, runs };
}

function seedSeq(base, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(base + i);
  return out;
}

async function main() {
  const allResults = [];

  // 1. EXACT reproduction of the user's URL.
  {
    const r = runOne({
      lineup: BASE_LINEUP,
      mapConfig: BASE_MAP,
      startPositions: BASE_POSITIONS,
      seed: FIXED_SEED,
    });
    console.log(`=== Exact reproduction (seed=${FIXED_SEED}) ===`);
    console.log(`  winner: ${r.winner}`);
    console.log(`  ${A}: place=${r.aPlace} terr=${r.aTerr} ${r.aElim != null ? `elim@${r.aElim}` : "alive"}`);
    console.log(`  ${B}: place=${r.bPlace} terr=${r.bTerr} ${r.bElim != null ? `elim@${r.bElim}` : "alive"}`);
    console.log(`  ticks=${r.ticks} endReason=${r.endReason}`);
    allResults.push({ label: "exact-reproduction", ...r });
  }

  // 2. K=6 multi-seed: same map + lineup + positions, varying seed.
  {
    const seeds = seedSeq(FIXED_SEED, N_SEEDS);
    const runs = seeds.map((seed) => runOne({
      lineup: BASE_LINEUP, mapConfig: BASE_MAP, startPositions: BASE_POSITIONS, seed,
    }));
    allResults.push(summarize(`K=6, original-seats, seeds ${FIXED_SEED}..${FIXED_SEED + N_SEEDS - 1}`, runs));
  }

  // 3. K=6 SEAT-SWAP control: swap A↔B slot assignments.
  {
    const swapped = BASE_LINEUP.slice();
    const ai = swapped.indexOf(A), bi = swapped.indexOf(B);
    [swapped[ai], swapped[bi]] = [swapped[bi], swapped[ai]];
    const seeds = seedSeq(FIXED_SEED, N_SEEDS);
    const runs = seeds.map((seed) => runOne({
      lineup: swapped, mapConfig: BASE_MAP, startPositions: BASE_POSITIONS, seed,
    }));
    allResults.push(summarize(`K=6, A↔B seats swapped (slots ${ai}↔${bi})`, runs));
  }

  // 4. K=2 head-to-head, varying seed. Two slots opposite each other.
  {
    const lineup = [A, B];
    const positions = lineupPositions(2, BASE_MAP);
    const seeds = seedSeq(FIXED_SEED, N_SEEDS);
    const runs = seeds.map((seed) => runOne({
      lineup, mapConfig: BASE_MAP, startPositions: positions, seed,
    }));
    allResults.push(summarize(`K=2, A vs B, A in slot 0`, runs));

    // Also reverse seat to control for slot bias.
    const runsRev = seeds.map((seed) => runOne({
      lineup: [B, A], mapConfig: BASE_MAP, startPositions: positions, seed,
    }));
    allResults.push(summarize(`K=2, A vs B, B in slot 0 (seat-swap)`, runsRev));
  }

  // 5. K=3 with each of the other 4 lineup bots as the filler.
  {
    const positions = lineupPositions(3, BASE_MAP);
    const fillers = BASE_LINEUP.filter((n) => n !== A && n !== B);
    for (const filler of fillers) {
      const seeds = seedSeq(FIXED_SEED, Math.min(N_SEEDS, 15));
      const runs = seeds.map((seed) => runOne({
        lineup: [A, B, filler], mapConfig: BASE_MAP, startPositions: positions, seed,
      }));
      allResults.push(summarize(`K=3, [A, B, ${filler}]`, runs));
    }
  }

  // 6. Map-param sweep at K=2: vary one knob at a time.
  {
    const sweeps = [
      ["size 30x30",  { ...BASE_MAP, width: 30, height: 30 }],
      ["size 24x18",  { ...BASE_MAP, width: 24, height: 18 }],
      ["size 60x60",  { ...BASE_MAP, width: 60, height: 60 }],
      ["growth 1.8",  { ...BASE_MAP, growth: 1.8 }],
      ["growth 0.8",  { ...BASE_MAP, growth: 0.8 }],
      ["maxArmy 6",   { ...BASE_MAP, maxArmy: 6 }],
      ["maxArmy 24",  { ...BASE_MAP, maxArmy: 24 }],
      ["wrap=false",  { ...BASE_MAP, wrap: false }],
    ];
    const seeds = seedSeq(FIXED_SEED, Math.min(N_SEEDS, 15));
    for (const [label, mapCfg] of sweeps) {
      const positions = placeForSize(mapCfg, 2);
      const runs = seeds.map((seed) => runOne({
        lineup: [A, B], mapConfig: mapCfg, startPositions: positions, seed,
      }));
      allResults.push(summarize(`K=2, sweep: ${label}`, runs));
    }
  }

  // Save raw results.
  const outPath = resolve("tournament/exp-4d842b-vs-2c6b71.json");
  writeFileSync(outPath, JSON.stringify({ A, B, baseMap: BASE_MAP, baseLineup: BASE_LINEUP, results: allResults }, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
