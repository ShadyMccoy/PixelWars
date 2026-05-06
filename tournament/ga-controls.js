#!/usr/bin/env node
// Quick "shouldn't work" baseline runner. Instantiates a handful
// of structurally weird Spearhead matrix variants and scores each
// against the same opponent pool the GA uses. Helps calibrate
// what the search-space floor actually looks like.
//
// Usage:
//   node tournament/ga-controls.js                # default opponents, N=300
//   node tournament/ga-controls.js --eval 500
//   node tournament/ga-controls.js --opponents A,B,C

import { runMatch } from "./arena.js";
import { MAPS } from "./maps.js";
import { mulberry32 } from "../src/core/rng.js";
import { getStrategy } from "../src/strategies/index.js";
import { loadRankings } from "./rankingsStore.js";
import {
  makeSpearheadFromKernel,
  MATRIX_DEFAULTS,
} from "../src/strategies/parametric/Spearhead.js";

function parseArgs(argv) {
  const opts = { eval: 300, map: "lab1", pool: 6, ticks: 4000, seed: 7777, opponents: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; const next = () => argv[++i];
    switch (a) {
      case "--eval": opts.eval = parseInt(next(), 10); break;
      case "--map": opts.map = next(); break;
      case "--pool": opts.pool = parseInt(next(), 10); break;
      case "--ticks": opts.ticks = parseInt(next(), 10); break;
      case "--seed": opts.seed = parseInt(next(), 10); break;
      case "--opponents": opts.opponents = next().split(",").map((s) => s.trim()); break;
    }
  }
  return opts;
}

const idx = (dy, dx) => (dy + 2) * 5 + (dx + 2);
const zeros = () => new Array(25).fill(0);

function defaultKernel() {
  const k = zeros();
  k[idx(0, -1)] = 3;
  k[idx(0, -2)] = 1;
  k[idx(-1, -1)] = 1;
  k[idx(1, -1)] = 1;
  return k;
}

function invertedKernel() {
  return defaultKernel().map((w) => -w);
}

function forwardOnlyKernel() {
  const k = zeros();
  k[idx(0, 1)] = 3;
  k[idx(0, 2)] = 1;
  k[idx(-1, 1)] = 1;
  k[idx(1, 1)] = 1;
  return k;
}

function antiPatternKernel() {
  // Rear cells negative (avoid rear support), forward cells positive
  // (seek danger), and small flank confusion for good measure.
  const k = zeros();
  k[idx(0, -1)] = -3;
  k[idx(0, -2)] = -1;
  k[idx(-1, -1)] = -1;
  k[idx(1, -1)] = -1;
  k[idx(0, 1)] = 3;
  k[idx(-1, 1)] = 1;
  k[idx(1, 1)] = 1;
  return k;
}

function randomKernel(rng) {
  return Array.from({ length: 25 }, () => -3 + rng() * 6);
}

function uniformKernel(w) {
  const k = new Array(25).fill(w);
  k[idx(0, 0)] = 0; // center
  return k;
}

const VARIANTS = [
  { name: "default-Spearhead",       kernel: defaultKernel() },
  { name: "all-zero-kernel",         kernel: zeros() },
  { name: "uniform+1",               kernel: uniformKernel(1) },
  { name: "uniform-1",               kernel: uniformKernel(-1) },
  { name: "inverted-Spearhead",      kernel: invertedKernel() },
  { name: "forward-only-Spearhead",  kernel: forwardOnlyKernel() },
  { name: "anti-pattern",            kernel: antiPatternKernel() },
];

function evalOne({ kernel, name, opponents, opts, rngSeed }) {
  const map = MAPS[opts.map];
  const positions = map.positions(opts.pool);
  const bot = makeSpearheadFromKernel({ ...MATRIX_DEFAULTS, kernel, name });
  const rng = mulberry32(rngSeed);
  let totalRank = 0; let wins = 0; let played = 0;
  for (let m = 0; m < opts.eval; m++) {
    const others = opponents.slice().sort(() => rng() - 0.5).slice(0, opts.pool - 1);
    const lineup = [bot, ...others];
    for (let i = lineup.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [lineup[i], lineup[j]] = [lineup[j], lineup[i]];
    }
    const result = runMatch({
      strategies: lineup, mapConfig: map.config, startPositions: positions,
      seed: rngSeed + m, maxTicks: opts.ticks,
    });
    const rank = result.ranking.findIndex((r) => r.strategy === name);
    if (rank < 0) continue;
    played++;
    totalRank += rank;
    if (rank === 0 && result.ranking[0].survived) wins++;
  }
  return { fitness: totalRank / played, wins, played, winPct: 100 * wins / played };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let opponentNames = opts.opponents;
  if (!opponentNames) {
    const r = await loadRankings();
    opponentNames = r.players.slice().sort((a, b) => b.rating - a.rating).slice(0, 10).map((p) => p.name);
  }
  const opponents = opponentNames.map(getStrategy);
  console.log(`Controls: ${opts.eval} matches each, K=${opts.pool}, map=${opts.map}`);
  console.log(`Opponents: ${opponentNames.join(", ")}`);
  console.log(`Random seed: ${opts.seed}\n`);

  // Random baseline rotates seed each variant so it's not the same
  // 25 weights every run.
  const variants = [...VARIANTS, { name: "random-uniform-[-3,3]", kernel: randomKernel(mulberry32(opts.seed)) }];

  const rows = [];
  for (const v of variants) {
    const r = evalOne({ kernel: v.kernel, name: v.name, opponents, opts, rngSeed: opts.seed });
    rows.push({ name: v.name, ...r });
  }
  rows.sort((a, b) => a.fitness - b.fitness);

  const colName = Math.max(...rows.map((r) => r.name.length));
  console.log(`${"variant".padEnd(colName)}  fitness  win%   played`);
  console.log("-".repeat(colName + 26));
  for (const r of rows) {
    console.log(
      `${r.name.padEnd(colName)}  ${r.fitness.toFixed(3).padStart(7)}  ${r.winPct.toFixed(1).padStart(4)}%  ${String(r.played).padStart(5)}`,
    );
  }
}

main();
