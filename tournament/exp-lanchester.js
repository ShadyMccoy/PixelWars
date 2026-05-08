#!/usr/bin/env node
// Compare bot performance under different combat models.
//
// Usage:
//   node tournament/exp-lanchester.js --model linear --matches 1000 --seed 1
//   node tournament/exp-lanchester.js --model lanchester --matches 1000 --seed 1
//   node tournament/exp-lanchester.js --compare lin.json lan.json
//
// Writes a JSON output per run for later --compare aggregation. Uses
// the active pool (STRATEGY_LIST, ~60 bots) as the field, K=5 lab1.
// Matches run in-memory only; matches.jsonl + rankings.json are not
// touched.

import { STRATEGY_LIST } from "../src/strategies/index.js";
import { MAPS } from "./maps.js";
import { runRatingTournament } from "./scheduler.js";
import { loadRankings, priorMap } from "./rankingsStore.js";
import { writeFile, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    model: "linear",
    matches: 1000,
    seed: 1,
    out: null,
    compare: null,
    pool: 5,
    map: "lab1",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--model": opts.model = next(); break;
      case "--matches": opts.matches = parseInt(next(), 10); break;
      case "--seed": opts.seed = parseInt(next(), 10); break;
      case "--out": opts.out = next(); break;
      case "--compare": opts.compare = [next(), next()]; break;
      case "--pool": opts.pool = parseInt(next(), 10); break;
      case "--map": opts.map = next(); break;
      default: throw new Error(`Unknown option: ${a}`);
    }
  }
  return opts;
}

function spearman(items, keyA, keyB) {
  const N = items.length;
  if (N < 2) return null;
  const byA = items.slice().sort((a, b) => b[keyA] - a[keyA]);
  const byB = items.slice().sort((a, b) => b[keyB] - a[keyB]);
  const rA = new Map(), rB = new Map();
  byA.forEach((r, i) => rA.set(r.name, i + 1));
  byB.forEach((r, i) => rB.set(r.name, i + 1));
  let d2 = 0;
  for (const r of items) d2 += (rA.get(r.name) - rB.get(r.name)) ** 2;
  return 1 - (6 * d2) / (N * (N * N - 1));
}

async function runOne(opts) {
  const baseMap = MAPS[opts.map];
  const map = {
    ...baseMap,
    config: { ...baseMap.config, combatModel: opts.model },
  };
  const strategies = STRATEGY_LIST.slice();
  console.log(`Field: ${strategies.length} bots. Model: ${opts.model}.`);
  console.log(`${opts.matches} K=${opts.pool} matches on ${opts.map}, seed=${opts.seed}.`);
  const seedRankings = await loadRankings();
  const priors = seedRankings ? priorMap(seedRankings) : null;

  const pairWin = new Map();
  const pairEnc = new Map();
  for (const s of strategies) {
    pairWin.set(s.name, new Map());
    pairEnc.set(s.name, new Map());
  }

  const t0 = Date.now();
  const result = runRatingTournament({
    strategies,
    map,
    poolSize: opts.pool,
    matches: opts.matches,
    baseSeed: opts.seed,
    maxTicks: 4000,
    priors,
    onMatch: (mi, matchResult) => {
      const order = matchResult.ranking.map((r) => r.strategy);
      for (let i = 0; i < order.length; i++) {
        for (let j = 0; j < order.length; j++) {
          if (i === j) continue;
          const a = order[i], b = order[j];
          pairEnc.get(a).set(b, (pairEnc.get(a).get(b) ?? 0) + 1);
          if (i < j) pairWin.get(a).set(b, (pairWin.get(a).get(b) ?? 0) + 1);
        }
      }
      if ((mi + 1) % 100 === 0) {
        const dt = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`  ${mi + 1}/${opts.matches}  [${dt}s]`);
      }
    },
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Done in ${dt}s.\n`);

  const standings = result.standings.map((s, i) => ({
    rank: i + 1,
    name: s.name,
    rating: s.rating,
    winRate: +(s.winRate ?? 0).toFixed(3),
    ppg: +s.pointsPerGame.toFixed(3),
    played: s.played,
    wins: s.wins,
    globalRating: priors?.[s.name]?.rating ?? null,
  }));

  console.log(`Top 20 (model=${opts.model}):`);
  console.log(`  rank  rating  win%   played | gRating  bot`);
  for (const r of standings.slice(0, 20)) {
    console.log(
      `  ${String(r.rank).padStart(3)}.  ${String(r.rating).padStart(5)}  ${(100 * r.winRate).toFixed(1).padStart(5)}  ${String(r.played).padStart(5)}  | ${String(r.globalRating ?? "-").padStart(5)}  ${r.name}`,
    );
  }

  // Drumline-specific pairwise (sorted by global rating).
  const drumEnc = pairEnc.get("Drumline");
  const drumWin = pairWin.get("Drumline");
  let drumlineRow = null;
  if (drumEnc) {
    const rows = [];
    for (const [opp, n] of drumEnc.entries()) {
      const w = drumWin.get(opp) ?? 0;
      rows.push({
        name: opp,
        encounters: n,
        wins: w,
        winRate: n ? +(w / n).toFixed(3) : 0,
        globalRating: priors?.[opp]?.rating ?? null,
      });
    }
    rows.sort((a, b) => (b.globalRating ?? 0) - (a.globalRating ?? 0));
    let totalEnc = 0, totalWin = 0;
    for (const r of rows) { totalEnc += r.encounters; totalWin += r.wins; }
    drumlineRow = {
      rows,
      totalEnc,
      totalWin,
      overall: totalEnc ? totalWin / totalEnc : 0,
    };
    console.log(`\nDrumline overall pairwise: ${totalWin}/${totalEnc} = ${(100 * drumlineRow.overall).toFixed(1)}%`);
  }

  const rhoR = spearman(standings, "rating", "winRate");
  const rhoG = spearman(standings.filter((r) => r.globalRating != null), "rating", "globalRating");
  console.log(`Spearman rho(rating, winRate)=${rhoR?.toFixed(3) ?? "-"}, rho(rating, global)=${rhoG?.toFixed(3) ?? "-"}`);

  const outPath = opts.out ?? resolve(HERE, `exp-lanchester-${opts.model}.json`);
  await writeFile(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    opts,
    standings,
    drumline: drumlineRow,
    correlations: { rhoRatingWinRate: rhoR, rhoRatingGlobal: rhoG },
  }, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath}`);
  return outPath;
}

async function compare(pathA, pathB) {
  const A = JSON.parse(await readFile(pathA, "utf8"));
  const B = JSON.parse(await readFile(pathB, "utf8"));
  const labelA = A.opts.model;
  const labelB = B.opts.model;
  console.log(`Compare ${labelA} (${pathA}) vs ${labelB} (${pathB})`);

  const rankA = new Map(A.standings.map((r) => [r.name, r.rank]));
  const ratingA = new Map(A.standings.map((r) => [r.name, r.rating]));
  const rankB = new Map(B.standings.map((r) => [r.name, r.rank]));
  const ratingB = new Map(B.standings.map((r) => [r.name, r.rating]));

  // Spearman rho between the two rankings (full overlap).
  const names = [...rankA.keys()].filter((n) => rankB.has(n));
  let d2 = 0;
  for (const n of names) d2 += (rankA.get(n) - rankB.get(n)) ** 2;
  const N = names.length;
  const rho = 1 - (6 * d2) / (N * (N * N - 1));
  console.log(`Spearman rho between rankings: ${rho.toFixed(3)} (${N} bots)`);

  // Biggest movers.
  const moves = names.map((n) => ({
    name: n,
    delta: rankA.get(n) - rankB.get(n),  // positive = climbed under model B
    ratingA: ratingA.get(n),
    ratingB: ratingB.get(n),
    rankA: rankA.get(n),
    rankB: rankB.get(n),
  }));
  moves.sort((a, b) => b.delta - a.delta);
  console.log(`\nBiggest climbers (${labelA} -> ${labelB}, +Δ = climbed):`);
  for (const m of moves.slice(0, 10)) {
    console.log(`  +${String(m.delta).padStart(2)}  ${labelA} #${String(m.rankA).padStart(2)} (${m.ratingA}) -> ${labelB} #${String(m.rankB).padStart(2)} (${m.ratingB})  ${m.name}`);
  }
  console.log(`\nBiggest fallers:`);
  for (const m of moves.slice(-10).reverse()) {
    console.log(`  ${String(m.delta).padStart(3)}  ${labelA} #${String(m.rankA).padStart(2)} (${m.ratingA}) -> ${labelB} #${String(m.rankB).padStart(2)} (${m.ratingB})  ${m.name}`);
  }

  // Drumline change.
  if (A.drumline && B.drumline) {
    console.log(`\nDrumline:`);
    console.log(`  ${labelA}:    rank ${rankA.get("Drumline")}, rating ${ratingA.get("Drumline")}, pairwise ${(100 * A.drumline.overall).toFixed(1)}%`);
    console.log(`  ${labelB}:    rank ${rankB.get("Drumline")}, rating ${ratingB.get("Drumline")}, pairwise ${(100 * B.drumline.overall).toFixed(1)}%`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.compare) {
    await compare(opts.compare[0], opts.compare[1]);
    return;
  }
  if (opts.model !== "linear" && opts.model !== "lanchester") {
    throw new Error(`--model must be linear or lanchester, got ${opts.model}`);
  }
  await runOne(opts);
}

main().catch((e) => { console.error(e); process.exit(1); });
