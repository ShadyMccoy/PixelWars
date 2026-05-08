#!/usr/bin/env node
// Cross-era tournament keyed off bot generation.
//
// "Era" = generation. Naming convention `Conqueror_gN_xxxxxx` makes
// generation a clean era proxy: it advances every time the spawn loop
// produces a descendant, so g14 is older than g15 by construction.
// Earlier versions of this tool sliced the match log by timestamp; the
// generation-based view is preferred because it is independent of how
// densely the loop ran during any given period and works without the
// (gitignored) matches.jsonl.
//
// Pipeline:
//   1. Load rankings.json + lineages.json. Bucket bots by generation.
//   2. Per generation, pick the top-`top` bots that have at least
//      `--min-played` matches under the current rules version.
//   3. Optionally `--pin` a specific bot into the field (e.g. a fresh
//      newcomer you want to evaluate against older champions).
//   4. Resolve names via ALL_STRATEGIES (archived bots remain loadable).
//   5. Run runRatingTournament. Fresh PL fit on just these matches —
//      independent of the global ranking, so it tests whether a bot's
//      global rating reflects head-to-head dominance or is a
//      current-pool artifact.
//   6. Report cross-era rating + winRate side-by-side, per-era avg
//      rank/rating, and (if --pin) the pinned bot's pairwise win-rate
//      vs every opponent it shared a match with. Spearman rho between
//      cross-era rating and cross-era winRate quantifies how well the
//      rating tracks raw wins.
//
// Usage:
//   node tournament/eras.js
//   node tournament/eras.js --pin Conqueror_g14_8d5369
//   node tournament/eras.js --top 2 --matches 400 --map lab1
//   node tournament/eras.js --no-append           # don't persist to log

import { ALL_STRATEGIES } from "../src/strategies/index.js";
import { MAPS } from "./maps.js";
import { runRatingTournament } from "./scheduler.js";
import { buildMatchEntry, appendMatches, loadMatches, getMatchLogPath } from "./matchLog.js";
import { loadRankings, saveRankings, getRankingsPath } from "./rankingsStore.js";
import { loadLineages } from "./lineageStore.js";
import { buildRankings, filterCurrentVersion } from "./rank.js";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(HERE, "eras.json");

function parseArgs(argv) {
  const opts = {
    top: 1,
    matches: 400,
    pool: null,
    map: "lab1",
    seed: 1,
    minPlayed: 15,
    pin: null,
    append: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--top": opts.top = parseInt(next(), 10); break;
      case "--matches": opts.matches = parseInt(next(), 10); break;
      case "--pool": opts.pool = parseInt(next(), 10); break;
      case "--map": opts.map = next(); break;
      case "--seed": opts.seed = parseInt(next(), 10); break;
      case "--min-played": opts.minPlayed = parseInt(next(), 10); break;
      case "--pin": opts.pin = next(); break;
      case "--no-append": opts.append = false; break;
      default: throw new Error(`Unknown option: ${a}`);
    }
  }
  return opts;
}

function pickEraChampions(rankings, lineages, top, minPlayed) {
  // Each generation = one era. Within each era, rank bots by current
  // global rating and take the top-`top` bots that played at least
  // `minPlayed` matches under the current rules version. Bots without
  // a lineage record (e.g. founders not yet enrolled) are skipped.
  const lineByName = new Map(lineages.map((b) => [b.name, b]));
  const buckets = new Map();
  for (const p of rankings.players) {
    const ln = lineByName.get(p.name);
    if (!ln) continue;
    if ((p.matches ?? 0) < minPlayed) continue;
    const g = ln.generation;
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g).push({
      name: p.name,
      rating: p.rating,
      matches: p.matches,
      wins: p.wins,
      generation: g,
    });
  }
  const eras = [];
  const champions = new Map(); // name -> { generation, rating, matches, wins }
  for (const g of [...buckets.keys()].sort((a, b) => a - b)) {
    const top_ = buckets.get(g).sort((a, b) => b.rating - a.rating).slice(0, top);
    if (!top_.length) continue;
    eras.push({ generation: g, top: top_ });
    for (const r of top_) champions.set(r.name, r);
  }
  return { eras, champions };
}

function pickPool(map, opt) {
  if (opt) return opt;
  return map.players ?? 5;
}

function spearman(items, keyA, keyB) {
  // items: array of { name, ... }; keyA, keyB: numeric fields whose
  // descending order defines a ranking. Returns Spearman rho. Ties are
  // broken stably (the internal sort is stable in Node).
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const map = MAPS[opts.map];
  if (!map) throw new Error(`Unknown map: ${opts.map}. Choices: ${Object.keys(MAPS).join(", ")}`);

  console.log(`Loading rankings + lineages...`);
  const [rankings, lineages] = await Promise.all([loadRankings(), loadLineages()]);
  if (!rankings) throw new Error(`No rankings.json — run \`npm run rank\` first.`);
  if (!lineages.length) throw new Error(`No lineage records — run the loop or seed lineages.json first.`);
  console.log(`  ${rankings.players.length} players, ${lineages.length} lineage records (current: ${rankings.matchCount} matches)`);

  const { eras, champions } = pickEraChampions(rankings, lineages, opts.top, opts.minPlayed);

  // Pin a specific bot if requested. If it's already a champion, nothing
  // changes; otherwise we add it with whatever lineage/rating data we
  // have so it still gets reported in the per-era summary.
  if (opts.pin && !champions.has(opts.pin)) {
    const p = rankings.players.find((x) => x.name === opts.pin);
    if (!p) throw new Error(`--pin ${opts.pin}: not in rankings.json`);
    const ln = lineages.find((b) => b.name === opts.pin);
    champions.set(opts.pin, {
      name: p.name,
      rating: p.rating,
      matches: p.matches,
      wins: p.wins,
      generation: ln?.generation ?? null,
    });
    console.log(`Pinned ${opts.pin} into the field (gen ${ln?.generation ?? "?"}, rating ${p.rating}).`);
  }

  console.log(`\nEra champions (top ${opts.top} per generation, min ${opts.minPlayed} matches):`);
  for (const era of eras) {
    for (const r of era.top) {
      const wr = r.matches ? (100 * r.wins / r.matches).toFixed(0) : "  -";
      console.log(`  g${String(era.generation).padStart(2)}  ${String(r.rating).padStart(5)}  ${r.name.padEnd(28)}  ${r.wins}/${r.matches} (${wr}%)`);
    }
  }

  // Resolve to strategy modules. Archived bots stay loadable via
  // ALL_STRATEGIES, which is exactly what we want — historical
  // top-of-era bots are the whole point.
  const missing = [];
  const field = [];
  const fieldMeta = new Map();
  for (const [name, meta] of champions.entries()) {
    const s = ALL_STRATEGIES[name];
    if (s) {
      field.push(s);
      fieldMeta.set(name, meta);
    } else {
      missing.push(name);
    }
  }
  if (missing.length) {
    console.warn(`  WARNING: ${missing.length} bot${missing.length === 1 ? "" : "s"} unloadable — file deleted? ${missing.join(", ")}`);
  }
  if (field.length < 3) {
    throw new Error(`Need at least 3 loadable bots; got ${field.length}`);
  }

  const k = Math.min(pickPool(map, opts.pool), field.length);
  console.log(`\nField: ${field.length} bots. Running cross-era tournament: ${opts.matches} matches, K=${k}, map=${opts.map}\n`);

  // Per-pair coplay counters: pairWin[a].get(b) = number of matches
  // where a finished above b (only meaningful when a and b were both
  // sampled into the same lineup). Used for the pinned bot's pairwise
  // win-rate report.
  const pairWin = new Map();
  const pairEnc = new Map();
  for (const s of field) {
    pairWin.set(s.name, new Map());
    pairEnc.set(s.name, new Map());
  }
  function bumpPair(a, b, aWon) {
    const enc = pairEnc.get(a);
    enc.set(b, (enc.get(b) ?? 0) + 1);
    if (aWon) {
      const w = pairWin.get(a);
      w.set(b, (w.get(b) ?? 0) + 1);
    }
  }

  const t0 = Date.now();
  const matchEntries = [];
  const result = runRatingTournament({
    strategies: field,
    map,
    poolSize: k,
    matches: opts.matches,
    baseSeed: opts.seed,
    maxTicks: 4000,
    onMatch: (mi, matchResult) => {
      const order = matchResult.ranking.map((r) => r.strategy);
      for (let i = 0; i < order.length; i++) {
        for (let j = 0; j < order.length; j++) {
          if (i === j) continue;
          bumpPair(order[i], order[j], i < j);
        }
      }
      matchEntries.push(buildMatchEntry({
        map: { name: map.name, config: map.config },
        result: { ...matchResult, seed: opts.seed + mi },
      }));
      if ((mi + 1) % 50 === 0) {
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`  ${mi + 1}/${opts.matches} matches  [${dt}s]`);
      }
    },
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nTournament complete in ${dt}s.\n`);

  // Annotate standings with era + global priors.
  const annotated = result.standings.map((s, i) => {
    const meta = fieldMeta.get(s.name);
    return {
      rank: i + 1,
      name: s.name,
      generation: meta?.generation ?? null,
      crossRating: s.rating,
      crossWinRate: +(s.winRate ?? 0).toFixed(3),
      crossPpg: +s.pointsPerGame.toFixed(3),
      crossPlayed: s.played,
      crossWins: s.wins,
      globalRating: meta?.rating ?? null,
      globalMatches: meta?.matches ?? null,
      globalWinRate: meta && meta.matches ? +(meta.wins / meta.matches).toFixed(3) : null,
    };
  });

  console.log(`Cross-era standings (sorted by cross-era rating):`);
  console.log(`  rank  gen  xRating  xWin%  xPPG  xPlayed | gRating  gWin%  gPlayed  bot`);
  for (const r of annotated) {
    const xr = String(r.crossRating).padStart(5);
    const gr = String(r.globalRating ?? "-").padStart(5);
    const xw = (100 * r.crossWinRate).toFixed(1).padStart(5);
    const gw = r.globalWinRate != null ? (100 * r.globalWinRate).toFixed(1).padStart(5) : "    -";
    const ppg = r.crossPpg.toFixed(2).padStart(4);
    const gen = r.generation != null ? `g${String(r.generation).padStart(2)}` : "  -";
    console.log(
      `  ${String(r.rank).padStart(2)}.   ${gen}  ${xr}   ${xw}  ${ppg}   ${String(r.crossPlayed).padStart(4)}  | ${gr}   ${gw}   ${String(r.globalMatches ?? "-").padStart(5)}  ${r.name}`,
    );
  }

  // Per-era summary: avg rank + rating of bots from each generation in
  // the cross-era field. Lower avg rank = stronger; trend across
  // generations shows real progress (or lack of it).
  const byEra = new Map();
  for (const r of annotated) {
    const e = r.generation;
    if (e == null) continue;
    if (!byEra.has(e)) byEra.set(e, []);
    byEra.get(e).push(r);
  }
  console.log(`\nAvg cross-era rank by generation (lower = stronger):`);
  const sortedEras = [...byEra.keys()].sort((a, b) => a - b);
  for (const e of sortedEras) {
    const rows = byEra.get(e);
    const avgRank = rows.reduce((a, r) => a + r.rank, 0) / rows.length;
    const avgRating = rows.reduce((a, r) => a + r.crossRating, 0) / rows.length;
    const avgWin = rows.reduce((a, r) => a + r.crossWinRate, 0) / rows.length;
    console.log(`  g${String(e).padStart(2)}  n=${rows.length}  avgRank=${avgRank.toFixed(1)}  avgRating=${avgRating.toFixed(0)}  avgWin%=${(100 * avgWin).toFixed(1)}`);
  }

  // Spearman rho between cross-era rating and (a) cross-era winRate,
  // (b) global rating. (a) tells you whether the rating tracks raw
  // wins in this field; (b) tells you whether the global ranking
  // agrees with the head-to-head verdict.
  const rhoXrXw = spearman(annotated, "crossRating", "crossWinRate");
  const annotatedWithG = annotated.filter((r) => r.globalRating != null);
  const rhoXrG = spearman(annotatedWithG, "crossRating", "globalRating");
  console.log(`\nSpearman rank correlations:`);
  console.log(`  cross rating vs cross winRate : rho = ${rhoXrXw?.toFixed(3) ?? "-"}`);
  console.log(`  cross rating vs global rating : rho = ${rhoXrG?.toFixed(3) ?? "-"}`);

  // Pairwise winrate of pinned bot vs every opponent it shared a match
  // with. This is the head-to-head answer: "in matches where both bot
  // X and pin both played, who finished higher more often?"
  let pinReport = null;
  if (opts.pin) {
    const enc = pairEnc.get(opts.pin);
    if (enc) {
      const rows = [];
      for (const [opp, n] of enc.entries()) {
        const w = pairWin.get(opts.pin).get(opp) ?? 0;
        const meta = fieldMeta.get(opp);
        rows.push({
          name: opp,
          encounters: n,
          wins: w,
          winRate: n ? +(w / n).toFixed(3) : 0,
          generation: meta?.generation ?? null,
          globalRating: meta?.rating ?? null,
        });
      }
      rows.sort((a, b) => (a.generation ?? 0) - (b.generation ?? 0) || (b.globalRating ?? 0) - (a.globalRating ?? 0));
      console.log(`\nPairwise (FFA-coplay) winrate of ${opts.pin} vs each opponent:`);
      console.log(`  opp_gen  oppRating  enc  wins  win%   opponent`);
      let totalEnc = 0, totalWin = 0;
      for (const r of rows) {
        totalEnc += r.encounters;
        totalWin += r.wins;
        const gen = r.generation != null ? `g${String(r.generation).padStart(2)}` : "  -";
        console.log(
          `  ${gen}     ${String(r.globalRating ?? "-").padStart(5)}  ${String(r.encounters).padStart(3)}  ${String(r.wins).padStart(4)}  ${(100 * r.winRate).toFixed(1).padStart(5)}  ${r.name}`,
        );
      }
      const overall = totalEnc ? totalWin / totalEnc : 0;
      console.log(`  ----  overall: ${totalWin}/${totalEnc} = ${(100 * overall).toFixed(1)}% pairwise wins across all opponents`);
      pinReport = { rows, totalEnc, totalWin, overallWinRate: +overall.toFixed(3) };
    }
  }

  await writeFile(
    OUT_PATH,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      opts,
      eras,
      missing,
      standings: annotated,
      correlations: { rhoXrXw, rhoXrG },
      pin: opts.pin ? { name: opts.pin, ...(pinReport ?? {}) } : null,
    }, null, 2) + "\n",
    "utf8",
  );
  console.log(`\nWrote ${OUT_PATH}`);

  if (opts.append && matchEntries.length) {
    // Persist matches into the global log + refit the global PL ranking.
    // Skip the refit if the log was empty before this run (we'd be
    // building a global ranking from only ~400 cross-era matches, which
    // would clobber the real one).
    const existingBefore = await loadMatches();
    if (existingBefore.length === 0) {
      console.log(`\n--append: matches.jsonl is empty; appending the ${matchEntries.length} cross-era matches but skipping global rankings refit (would clobber rankings.json with too little data).`);
      await appendMatches(matchEntries);
    } else {
      console.log(`\nAppending ${matchEntries.length} matches to ${getMatchLogPath()}...`);
      await appendMatches(matchEntries);
      console.log(`Refitting global rankings...`);
      const allLog = await loadMatches();
      const currentLog = filterCurrentVersion(allLog);
      const refreshed = buildRankings(currentLog);
      await saveRankings(refreshed);
      console.log(`Wrote ${getRankingsPath()} (${refreshed.players.length} players, ${refreshed.matchCount} matches).`);
    }
  } else if (!opts.append) {
    console.log(`\n--no-append: ${matchEntries.length} cross-era matches not persisted.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
