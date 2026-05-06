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
  makeSpearheadFromKernel,
  SPEARHEAD_DEFAULTS,
  SPEARHEAD_SCHEMA,
  MATRIX_DEFAULTS,
  MATRIX_SCHEMA,
} from "../src/strategies/parametric/Spearhead.js";
import { writeFile } from "node:fs/promises";

const SCHEMAS = {
  Spearhead:       { defaults: SPEARHEAD_DEFAULTS, schema: SPEARHEAD_SCHEMA, make: makeSpearheadVariant },
  SpearheadMatrix: { defaults: MATRIX_DEFAULTS,    schema: MATRIX_SCHEMA,    make: makeSpearheadFromKernel },
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
  --warm F            Fraction of initial pop seeded from schema
                      defaults + perturbation (rest random). Use 1.0
                      for pure local search, 0.0 for pure random.
                      (default: 0.5 — half warm-start, half explore)
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
    warm: 0.5,
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
      case "--warm": opts.warm = parseFloat(next()); break;
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

// Standard normal via Box-Muller.
function gaussian(rng) {
  const u = Math.max(rng(), 1e-12);
  const v = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function randScalar(s, rng) {
  let x = s.min + rng() * (s.max - s.min);
  if (s.int) x = Math.round(x);
  return x;
}

// Each schema entry is either a scalar { min, max, sigma, int? } or
// an array { length, min, max, sigma, int? }. Arrays are stored as
// regular JS arrays in the vector.
function randomVector(schema, rng) {
  const v = {};
  for (const [k, s] of Object.entries(schema)) {
    if (s.length != null) {
      v[k] = Array.from({ length: s.length }, () => randScalar(s, rng));
    } else {
      v[k] = randScalar(s, rng);
    }
  }
  return v;
}

function mutate(vec, schema, rng, prob) {
  const out = {};
  for (const [k, s] of Object.entries(schema)) {
    if (s.length != null) {
      const arr = vec[k].slice();
      for (let i = 0; i < arr.length; i++) {
        if (rng() >= prob) continue;
        let x = arr[i] + s.sigma * gaussian(rng);
        x = clamp(x, s.min, s.max);
        if (s.int) x = Math.round(x);
        arr[i] = x;
      }
      out[k] = arr;
    } else {
      if (rng() >= prob) { out[k] = vec[k]; continue; }
      let x = vec[k] + s.sigma * gaussian(rng);
      x = clamp(x, s.min, s.max);
      if (s.int) x = Math.round(x);
      out[k] = x;
    }
  }
  return out;
}

// Crossover: per-cell uniform mix for arrays; per-key uniform mix
// for scalars. Per-cell mixing is important for the matrix knob —
// taking whole arrays at once would behave like "switch parents
// every other generation," which kills exploration of the basin.
function crossover(a, b, schema, rng) {
  const out = {};
  for (const [k, s] of Object.entries(schema)) {
    if (s.length != null) {
      const arr = new Array(s.length);
      for (let i = 0; i < s.length; i++) {
        arr[i] = rng() < 0.5 ? a[k][i] : b[k][i];
      }
      out[k] = arr;
    } else {
      out[k] = rng() < 0.5 ? a[k] : b[k];
    }
  }
  return out;
}

// Deep-copy a vector so we can mutate copies without aliasing the
// schema defaults (which contain frozen arrays).
function deepCopyVec(vec, schema) {
  const out = {};
  for (const k of Object.keys(schema)) {
    out[k] = Array.isArray(vec[k]) ? vec[k].slice() : vec[k];
  }
  return out;
}

function fmtScalar(x) {
  return typeof x === "number" ? +x.toFixed(3) : x;
}

function fmtVec(v) {
  return Object.entries(v)
    .map(([k, x]) => {
      if (Array.isArray(x)) {
        const nz = x.filter((w) => Math.abs(w) > 0.01).length;
        return `${k}=[${nz}/${x.length} nonzero]`;
      }
      return `${k}=${fmtScalar(x)}`;
    })
    .join(" ");
}

// Pretty-print a 5x5 matrix knob (East-facing). Center cell rendered
// as a dot to remind that it has no behavioral meaning.
function fmtMatrix5(arr) {
  const lines = [];
  for (let r = 0; r < 5; r++) {
    const cells = [];
    for (let c = 0; c < 5; c++) {
      const i = r * 5 + c;
      if (i === 12) cells.push(" .   ");
      else cells.push(arr[i].toFixed(2).padStart(5, " "));
    }
    lines.push(cells.join(" "));
  }
  return lines.join("\n");
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

  // Warm-start: a fraction of the initial population starts as the
  // schema defaults plus perturbation, the rest are random. This is
  // important on high-dim knobs (e.g. 25-cell matrix) where pure
  // random init is hopeless. The defaults vector itself goes in
  // unmodified so we always carry at least one "known good" baseline.
  const nWarm = Math.min(opts.pop, Math.max(1, Math.round(opts.pop * opts.warm)));
  let pop = [];
  // First slot is the unmutated defaults — guarantees the GA can't
  // regress below the parent if elite preservation is ≥ 1.
  pop.push(deepCopyVec(schemaInfo.defaults, schemaInfo.schema));
  while (pop.length < nWarm) {
    pop.push(mutate(deepCopyVec(schemaInfo.defaults, schemaInfo.schema),
                    schemaInfo.schema, rng, 0.5));
  }
  while (pop.length < opts.pop) {
    pop.push(randomVector(schemaInfo.schema, rng));
  }

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
    // Pretty-print any 5x5 matrix knobs.
    for (const [k, x] of Object.entries(r.vec)) {
      if (Array.isArray(x) && x.length === 25) {
        console.log(`        ${k} (East-facing):`);
        for (const line of fmtMatrix5(x).split("\n")) console.log(`          ${line}`);
      }
    }
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
