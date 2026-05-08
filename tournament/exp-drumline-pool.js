#!/usr/bin/env node
// One-shot: how does Drumline rank against the full active pool
// (STRATEGY_LIST, ~60 bots), under regular-ranking semantics?
//
// Mirrors the global ranking pipeline — runRatingTournament with K=5 on
// lab1, then PL fit — but runs in-memory only. No matches.jsonl writes,
// no rankings.json clobber. Reports cross-pool standings + Drumline's
// pairwise winrate vs every opponent it shared a match with.

import { STRATEGY_LIST, ALL_STRATEGIES } from "../src/strategies/index.js";
import { MAPS } from "./maps.js";
import { runRatingTournament } from "./scheduler.js";
import { loadRankings, priorMap } from "./rankingsStore.js";

const TARGET = "Drumline";
const MATCHES = parseInt(process.argv[2] ?? "1500", 10);
const SEED = parseInt(process.argv[3] ?? "1", 10);

const map = MAPS.lab1;
const strategies = STRATEGY_LIST.slice();
console.log(`Active pool: ${strategies.length} bots. Target: ${TARGET}.`);
console.log(`Running ${MATCHES} K=5 matches on ${map.name}, seed=${SEED}.`);
const seedRankings = await loadRankings();
const priors = seedRankings ? priorMap(seedRankings) : null;
console.log(`Priors loaded: ${priors ? Object.keys(priors).length + " bots" : "none"}`);

const pairWin = new Map();
const pairEnc = new Map();
for (const s of strategies) {
  pairWin.set(s.name, new Map());
  pairEnc.set(s.name, new Map());
}
function bumpPair(a, b, aWon) {
  pairEnc.get(a).set(b, (pairEnc.get(a).get(b) ?? 0) + 1);
  if (aWon) pairWin.get(a).set(b, (pairWin.get(a).get(b) ?? 0) + 1);
}

const t0 = Date.now();
const result = runRatingTournament({
  strategies,
  map,
  poolSize: map.players ?? 5,
  matches: MATCHES,
  baseSeed: SEED,
  maxTicks: 4000,
  priors,
  onMatch: (mi, matchResult) => {
    const order = matchResult.ranking.map((r) => r.strategy);
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        if (i === j) continue;
        bumpPair(order[i], order[j], i < j);
      }
    }
    if ((mi + 1) % 100 === 0) {
      const dt = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`  ${mi + 1}/${MATCHES}  [${dt}s]`);
    }
  },
});
const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`Done in ${dt}s.\n`);

// Standings: cross-pool rating + global rating side-by-side.
const annotated = result.standings.map((s, i) => {
  const prior = priors?.[s.name];
  return {
    rank: i + 1,
    name: s.name,
    crossRating: s.rating,
    crossWinRate: +(s.winRate ?? 0).toFixed(3),
    crossPpg: +s.pointsPerGame.toFixed(3),
    crossPlayed: s.played,
    crossWins: s.wins,
    globalRating: prior?.rating ?? null,
    globalPlayed: prior?.played ?? null,
  };
});

console.log(`Cross-pool standings (top 30 + Drumline):`);
console.log(`  rank   xRating  xWin%   xPlayed | gRating  gPlayed  bot`);
const targetRow = annotated.find((r) => r.name === TARGET);
const top30 = annotated.slice(0, 30);
const view = top30.find((r) => r.name === TARGET) ? top30 : [...top30, targetRow];
for (const r of view) {
  const tag = r.name === TARGET ? " <== TARGET" : "";
  console.log(
    `  ${String(r.rank).padStart(3)}.  ${String(r.crossRating).padStart(7)}  ` +
    `${(100 * r.crossWinRate).toFixed(1).padStart(5)}  ${String(r.crossPlayed).padStart(5)}  | ` +
    `${String(r.globalRating ?? "-").padStart(5)}    ${String(r.globalPlayed ?? "-").padStart(5)}    ${r.name}${tag}`,
  );
}

// Spearman correlations.
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
const rhoXrXw = spearman(annotated, "crossRating", "crossWinRate");
const annotatedWithG = annotated.filter((r) => r.globalRating != null);
const rhoXrG = spearman(annotatedWithG, "crossRating", "globalRating");
console.log(`\nSpearman:`);
console.log(`  cross rating vs cross winRate : ${rhoXrXw?.toFixed(3) ?? "-"}`);
console.log(`  cross rating vs global rating : ${rhoXrG?.toFixed(3) ?? "-"}`);

// Drumline pairwise.
if (targetRow) {
  console.log(`\n${TARGET} pairwise winrate (sorted by global rating, descending):`);
  console.log(`  gRating  enc  wins  win%   opponent`);
  const enc = pairEnc.get(TARGET);
  const wins = pairWin.get(TARGET);
  const rows = [];
  for (const [opp, n] of enc.entries()) {
    const w = wins.get(opp) ?? 0;
    rows.push({
      name: opp,
      enc: n,
      wins: w,
      winRate: n ? w / n : 0,
      gRating: priors?.[opp]?.rating ?? null,
    });
  }
  rows.sort((a, b) => (b.gRating ?? 0) - (a.gRating ?? 0));
  let totalEnc = 0, totalWin = 0;
  for (const r of rows) {
    totalEnc += r.enc;
    totalWin += r.wins;
    console.log(
      `  ${String(r.gRating ?? "-").padStart(5)}    ${String(r.enc).padStart(3)}  ${String(r.wins).padStart(4)}  ${(100 * r.winRate).toFixed(1).padStart(5)}  ${r.name}`,
    );
  }
  const overall = totalEnc ? totalWin / totalEnc : 0;
  console.log(`  ----  overall: ${totalWin}/${totalEnc} = ${(100 * overall).toFixed(1)}% pairwise wins`);
}
