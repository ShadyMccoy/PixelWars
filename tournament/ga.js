#!/usr/bin/env node
// Genetic-algorithm search over a parametric strategy template.
//
// Skips the spawn/register/commit pipeline entirely: variants are
// instantiated in-process, scored against a fixed opponent pool with
// in-process matches, and only the best vectors are written out at
// the end. Throughput is ~match-time bound (no fork, no LLM, no
// disk for the per-evaluation matches).
//
// Usage:
//   node tournament/ga.js                                 # defaults
//   node tournament/ga.js --pop 30 --gens 50 --eval 30
//   node tournament/ga.js --opponents Spearhead,Stalker,Crusader,...
//   node tournament/ga.js --map lab1 --pool 6 --seed 1
//   node tournament/ga.js --out tournament/ga-best.json   # write top
//
// Default fitness: average finish rank across N matches against random
// 5-bot lineups drawn from the opponent pool. Lower is better. Ranks
// are 0..K-1 (0 = winner).

import { runMatch } from "./arena.js";
import { MAPS } from "./maps.js";
import { mulberry32 } from "../src/core/rng.js";
import { STRATEGY_LIST, getStrategy } from "../src/strategies/index.js";
import { loadRankings } from "./rankingsStore.js";
import {
  makeSpearheadVariant,
  SPEARHEAD_DEFAULTS,
  SPEARHEAD_SCHEMA,
} from "../src/strategies/parametric/Spearhead.js";
import { writeFile } from "node:fs/promises";

const SCHEMAS = {
  Spearhead: { defaults: SPEARHEAD_DEFAULTS, schema: SPEARHEAD_SCHEMA, make: makeSpearheadVariant },
};

const HELP = `Usage: node tournament/ga.js [options]

Schema: ${Object.keys(SCHEMAS).join(", ")} (default: Spearhead)

Search:
  --schema NAME       Parametric template to optimize (default: Spearhead)
  --pop N             Population size (default: 24)
  --gens N            Generations to run (default: 20)
  --eval N            Matches per fitness eval (default: 20)
  --elite N           Top N kept unchanged each gen (default: 4)
  --mutate-prob P     Per-knob mutation probability (default: 0.3)
  --seed N            RNG seed (default: 1)

Match config:
  --map NAME          Map preset (default: lab1)
  --pool K            Bots per match (default: 6)
  --ticks N           Max ticks per match (default: 4000)
  --opponents A,B,C   Opponent pool (default: top-10 from rankings.json)

Output:
  --out FILE          Write top vectors as JSON (default: print only)
  --top N             How many best vectors to report (default: 5)
  --quiet             Skip per-generation log
`;

function parseArgs(argv) {
  const opts = {
    schema: "Spearhead",
    pop: 24,
    gens: 20,
    eval: 20,
    elite: 4,
    mutateProb: 0.3,
    seed: 1,
    map: "lab1",
    pool: 6,
    ticks: 4000,
    opponents: null,
    out: null,
    top: 5,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--schema": opts.schema = next(); break;
      case "--pop": opts.pop = parseInt(next(), 10); break;
      case "--gens": opts.gens = parseInt(next(), 10); break;
      case "--eval": opts.eval = parseInt(next(), 10); break;
      case "--elite": opts.elite = parseInt(next(), 10); break;
      case "--mutate-prob": opts.mutateProb = parseFloat(next()); break;
      case "--seed": opts.seed = parseInt(next(), 10); break;
      case "--map": opts.map = next(); break;
      case "--pool": opts.pool = parseInt(next(), 10); break;
      case "--ticks": opts.ticks = parseInt(next(), 10); break;
      case "--opponents": opts.opponents = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--out": opts.out = next(); break;
      case "--top": opts.top = parseInt(next(), 10); break;
      case "--quiet": opts.quiet = true; break;
      case "--help": case "-h": console.log(HELP); process.exit(0);
      default:
        console.error(`Unknown option: ${a}`);
        console.error(HELP);
        process.exit(1);
    }
  }
  return opts;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function randomVector(schema, rng) {
  const v = {};
  for (const [k, s] of Object.entries(schema)) {
    let x = s.min + rng() * (s.max - s.min);
    if (s.int) x = Math.round(x);
    v[k] = x;
  }
  return v;
}

// Standard normal via Box-Muller.
function gaussian(rng) {
  const u = Math.max(rng(), 1e-12);
  const v = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function mutate(vec, schema, rng, prob) {
  const out = { ...vec };
  for (const [k, s] of Object.entries(schema)) {
    if (rng() >= prob) continue;
    let x = out[k] + s.sigma * gaussian(rng);
    x = clamp(x, s.min, s.max);
    if (s.int) x = Math.round(x);
    out[k] = x;
  }
  return out;
}

function crossover(a, b, schema, rng) {
  const out = {};
  for (const k of Object.keys(schema)) {
    out[k] = rng() < 0.5 ? a[k] : b[k];
  }
  return out;
}

function fmtVec(v) {
  return Object.entries(v)
    .map(([k, x]) => `${k}=${typeof x === "number" ? +x.toFixed(3) : x}`)
    .join(" ");
}

function sample(items, k, rng) {
  const pool = items.slice();
  const out = [];
  for (let i = 0; i < k; i++) {
    const j = Math.floor(rng() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}

// Fitness: lower (better) average rank across `eval` matches.
// Each match: lineup = [individual] ∪ (K-1 sampled opponents). Random
// seat order. Returns mean rank in [0, K-1].
function evaluate({ individualName, individual, opponents, pool, map, ticks, evalMatches, baseSeed }) {
  const rng = mulberry32(baseSeed);
  const k = pool;
  const positions = MAPS[map].positions(k);
  const mapConfig = MAPS[map].config;
  let totalRank = 0;
  let wins = 0;
  let played = 0;
  for (let m = 0; m < evalMatches; m++) {
    const others = sample(opponents, k - 1, rng);
    const lineup = [individual, ...others];
    // Shuffle seat assignment.
    for (let i = lineup.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [lineup[i], lineup[j]] = [lineup[j], lineup[i]];
    }
    const result = runMatch({
      strategies: lineup,
      mapConfig,
      startPositions: positions,
      seed: baseSeed + m,
      maxTicks: ticks,
    });
    const rank = result.ranking.findIndex((r) => r.strategy === individualName);
    if (rank < 0) continue;
    totalRank += rank;
    played++;
    if (rank === 0 && result.ranking[0].survived) wins++;
  }
  if (played === 0) return { fitness: k, wins: 0, played: 0 };
  return { fitness: totalRank / played, wins, played };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const schemaInfo = SCHEMAS[opts.schema];
  if (!schemaInfo) {
    console.error(`Unknown schema: ${opts.schema}. Choose from: ${Object.keys(SCHEMAS).join(", ")}`);
    process.exit(1);
  }
  const map = MAPS[opts.map];
  if (!map) {
    console.error(`Unknown map: ${opts.map}`);
    process.exit(1);
  }

  // Opponent pool: explicit list, or top-10 from rankings.json.
  let opponentNames = opts.opponents;
  if (!opponentNames) {
    const rankings = await loadRankings();
    if (!rankings) {
      console.error("No rankings.json found and no --opponents given.");
      process.exit(1);
    }
    opponentNames = rankings.players
      .slice()
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 10)
      .map((p) => p.name);
  }
  const opponents = opponentNames.map(getStrategy);

  console.log(`GA over ${opts.schema}: pop=${opts.pop} gens=${opts.gens} eval=${opts.eval} map=${opts.map} K=${opts.pool}`);
  console.log(`Opponents (${opponents.length}): ${opponentNames.join(", ")}\n`);

  const rng = mulberry32(opts.seed);
  let pop = Array.from({ length: opts.pop }, () => randomVector(schemaInfo.schema, rng));

  const startTime = Date.now();
  let totalEvals = 0;
  let bestEver = null;

  for (let gen = 0; gen < opts.gens; gen++) {
    const genStart = Date.now();
    // Evaluate.
    const scored = pop.map((vec, idx) => {
      const name = `GA_g${gen}_${idx}`;
      const individual = schemaInfo.make({ ...vec, name });
      const { fitness, wins, played } = evaluate({
        individualName: name,
        individual,
        opponents,
        pool: opts.pool,
        map: opts.map,
        ticks: opts.ticks,
        evalMatches: opts.eval,
        baseSeed: opts.seed * 1000003 + gen * 100003 + idx,
      });
      totalEvals++;
      return { vec, fitness, wins, played };
    });
    scored.sort((a, b) => a.fitness - b.fitness);
    if (!bestEver || scored[0].fitness < bestEver.fitness) bestEver = scored[0];
    const genElapsed = (Date.now() - genStart) / 1000;
    if (!opts.quiet) {
      const best = scored[0];
      console.log(
        `gen ${String(gen).padStart(3)}  best=${best.fitness.toFixed(3)}  wins=${best.wins}/${best.played}  ` +
        `med=${scored[Math.floor(scored.length / 2)].fitness.toFixed(3)}  ` +
        `worst=${scored[scored.length - 1].fitness.toFixed(3)}  ` +
        `[${genElapsed.toFixed(1)}s]`,
      );
    }

    // Reproduce: keep elites, fill rest with mutated crossovers from elites.
    const elite = scored.slice(0, opts.elite).map((s) => s.vec);
    const next = elite.slice();
    while (next.length < opts.pop) {
      const a = elite[Math.floor(rng() * elite.length)];
      const b = elite[Math.floor(rng() * elite.length)];
      next.push(mutate(crossover(a, b, schemaInfo.schema, rng), schemaInfo.schema, rng, opts.mutateProb));
    }
    pop = next;
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nGA done in ${elapsed.toFixed(1)}s. ${totalEvals} evaluations × ${opts.eval} matches = ${totalEvals * opts.eval} matches total (${(totalEvals * opts.eval / elapsed).toFixed(1)} matches/sec).`);

  // Final eval at higher precision: re-score top elites with more matches.
  const finalEval = Math.max(opts.eval * 3, 60);
  console.log(`\nRe-scoring top ${opts.top} with ${finalEval} matches each:`);
  const finalScored = pop.slice(0, opts.elite).map((vec, idx) => {
    const name = `GA_final_${idx}`;
    const individual = schemaInfo.make({ ...vec, name });
    const r = evaluate({
      individualName: name, individual, opponents,
      pool: opts.pool, map: opts.map, ticks: opts.ticks,
      evalMatches: finalEval, baseSeed: opts.seed * 7919 + idx,
    });
    return { vec, ...r };
  });
  finalScored.sort((a, b) => a.fitness - b.fitness);

  console.log("\nTop vectors:");
  for (let i = 0; i < Math.min(opts.top, finalScored.length); i++) {
    const r = finalScored[i];
    console.log(`  #${i + 1}  fitness=${r.fitness.toFixed(3)}  wins=${r.wins}/${r.played} (${(100 * r.wins / r.played).toFixed(0)}%)`);
    console.log(`        ${fmtVec(r.vec)}`);
  }
  console.log(`\nDefault (parent Spearhead) for reference:`);
  const defResult = evaluate({
    individualName: "DEFAULTS",
    individual: schemaInfo.make({ ...schemaInfo.defaults, name: "DEFAULTS" }),
    opponents, pool: opts.pool, map: opts.map, ticks: opts.ticks,
    evalMatches: finalEval, baseSeed: opts.seed * 7919 + 9999,
  });
  console.log(`        fitness=${defResult.fitness.toFixed(3)}  wins=${defResult.wins}/${defResult.played} (${(100 * defResult.wins / defResult.played).toFixed(0)}%)`);

  if (opts.out) {
    await writeFile(opts.out, JSON.stringify({
      schema: opts.schema,
      params: { pop: opts.pop, gens: opts.gens, eval: opts.eval, elite: opts.elite, mutateProb: opts.mutateProb, seed: opts.seed, map: opts.map, pool: opts.pool, ticks: opts.ticks, opponents: opponentNames },
      finalEval,
      defaultFitness: defResult.fitness,
      top: finalScored.slice(0, opts.top),
    }, null, 2) + "\n");
    console.log(`\nWrote top vectors to ${opts.out}`);
  }
}

main();
