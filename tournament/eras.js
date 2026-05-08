#!/usr/bin/env node
// Cross-era tournament: take the top-K bots from each of N intervals
// across the full match log, then run them against each other in a
// fresh rating tournament. The point is to see whether bots are
// actually getting better over the loop's lifetime — something the
// global PL ranking can't show, because its geometric-mean
// normalization rebases the median to ~1000 every iteration.
//
// Pipeline:
//   1. Load matches.jsonl, filter to current rules version, sort by ts.
//   2. Divide into N equal-count intervals. At each interval's right
//      edge, fit PL on the cumulative matches up to that point and
//      identify the top-K bots of that era (with a min-played
//      threshold so a bot with 2 lucky matches doesn't represent an
//      era).
//   3. Union the era champions into a single field; resolve each name
//      via ALL_STRATEGIES so archived bots can still play.
//   4. Run a rating tournament with the era field. The resulting
//      standings tell you whether late-era bots out-rate early-era
//      bots in head-to-head play.
//
// Usage:
//   node tournament/eras.js
//   node tournament/eras.js --intervals 10 --top 3 --matches 250
//   node tournament/eras.js --map lab1 --pool 5

import { ALL_STRATEGIES } from "../src/strategies/index.js";
import { MAPS } from "./maps.js";
import { runRatingTournament } from "./scheduler.js";
import { buildMatchEntry, appendMatches, loadMatches, getMatchLogPath } from "./matchLog.js";
import { saveRankings, getRankingsPath } from "./rankingsStore.js";
import { buildRankings, filterCurrentVersion } from "./rank.js";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(HERE, "eras.json");

function parseArgs(argv) {
  const opts = {
    intervals: 10,
    top: 3,
    matches: 250,
    pool: null,
    map: "lab1",
    seed: 1,
    minPlayedInEra: 15,
    append: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--intervals": opts.intervals = parseInt(next(), 10); break;
      case "--top": opts.top = parseInt(next(), 10); break;
      case "--matches": opts.matches = parseInt(next(), 10); break;
      case "--pool": opts.pool = parseInt(next(), 10); break;
      case "--map": opts.map = next(); break;
      case "--seed": opts.seed = parseInt(next(), 10); break;
      case "--min-played": opts.minPlayedInEra = parseInt(next(), 10); break;
      case "--no-append": opts.append = false; break;
      default: throw new Error(`Unknown option: ${a}`);
    }
  }
  return opts;
}

function pickEraChampions(matches, intervals, top, minPlayed) {
  // For each interval i in [1..intervals], compute PL on matches[0..end_i]
  // and grab the top `top` bots that played at least `minPlayed` matches
  // in that era's window. Returns per-era info plus deduplicated field.
  const total = matches.length;
  const eras = [];
  const seen = new Map(); // name -> { firstEra, eras: [{i, rating, matches}] }

  for (let i = 1; i <= intervals; i++) {
    const endIdx = Math.floor((total * i) / intervals);
    const slice = matches.slice(0, endIdx);
    const ranking = buildRankings(slice);
    // buildRankings returns per-bot match counts on the slice.
    const eligible = ranking.players
      .filter((p) => (p.matches ?? 0) >= minPlayed)
      .slice(0, top);

    const era = {
      i,
      endMatch: endIdx,
      startTs: matches[0].ts,
      endTs: matches[endIdx - 1]?.ts,
      top: eligible.map((p) => ({
        name: p.name, rating: p.rating, matches: p.matches,
      })),
    };
    eras.push(era);

    for (const p of eligible) {
      if (!seen.has(p.name)) {
        seen.set(p.name, { firstEra: i, appearances: [] });
      }
      seen.get(p.name).appearances.push({
        era: i, rating: p.rating, matches: p.matches,
      });
    }
  }
  return { eras, seen };
}

function pickPool(map, opt) {
  if (opt) return opt;
  return map.players ?? 5;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const map = MAPS[opts.map];
  if (!map) throw new Error(`Unknown map: ${opts.map}. Choices: ${Object.keys(MAPS).join(", ")}`);

  console.log(`Loading match log...`);
  const all = await loadMatches();
  const matches = filterCurrentVersion(all).slice().sort((a, b) => {
    if (a.ts === b.ts) return 0;
    return a.ts < b.ts ? -1 : 1;
  });
  if (matches.length < opts.intervals * 10) {
    throw new Error(`Not enough matches (${matches.length}) to support ${opts.intervals} intervals.`);
  }
  console.log(`  ${matches.length} current-rules matches across ${matches[0].ts} → ${matches[matches.length - 1].ts}`);

  const { eras, seen } = pickEraChampions(matches, opts.intervals, opts.top, opts.minPlayedInEra);

  console.log(`\nEra champions (top ${opts.top} per era, min ${opts.minPlayedInEra} matches in era):`);
  for (const era of eras) {
    const span = `era ${era.i}/${opts.intervals}  matches 1..${era.endMatch}  ${era.endTs}`;
    console.log(`  ${span}`);
    for (const p of era.top) {
      const tag = seen.get(p.name).firstEra === era.i ? "NEW" : "   ";
      console.log(`    [${tag}] ${String(p.rating).padStart(5)}  ${p.name.padEnd(24)} (${p.matches}m)`);
    }
  }

  const fieldNames = [...seen.keys()];
  console.log(`\nUnique era champions: ${fieldNames.length} bots`);

  // Resolve names. Use ALL_STRATEGIES so archived bots are loadable —
  // an archived bot that was once a top-of-era is exactly what we want
  // to bring back for the cross-era tournament.
  const missing = [];
  const field = [];
  for (const name of fieldNames) {
    const s = ALL_STRATEGIES[name];
    if (s) field.push(s);
    else missing.push(name);
  }
  if (missing.length) {
    console.warn(`  WARNING: ${missing.length} bot${missing.length === 1 ? "" : "s"} unloadable — file deleted? ${missing.join(", ")}`);
  }
  if (field.length < 3) {
    throw new Error(`Need at least 3 loadable bots; got ${field.length}`);
  }

  const k = Math.min(pickPool(map, opts.pool), field.length);
  console.log(`\nRunning cross-era tournament: ${opts.matches} matches, K=${k}, map=${opts.map}\n`);

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
      // Cross-era matches go into matches.jsonl alongside loop matches.
      // Archived bots are archived for convenience (weaker than current
      // peers), not because their matches are from a different "era" —
      // here, "era" tracks the bot generation count, not match count.
      // Mixing this evidence into the global PL fit only adds data.
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

  // Annotate standings with era info.
  const annotated = result.standings.map((s) => {
    const meta = seen.get(s.name);
    return {
      ...s,
      firstEra: meta?.firstEra ?? null,
      appearances: meta?.appearances ?? [],
    };
  });

  console.log(`Cross-era standings (${field.length} bots, ${opts.matches} matches):`);
  console.log(`  rank  rating  played  firstEra  bot`);
  annotated.forEach((s, i) => {
    const era = s.firstEra ? `e${String(s.firstEra).padStart(2)}` : "  -";
    console.log(
      `  ${String(i + 1).padStart(2)}.   ${String(s.rating).padStart(5)}  ${String(s.played).padStart(5)}  ${era}      ${s.name}`,
    );
  });

  // Aggregate per-era: average rank of bots whose first era is X.
  const byEra = new Map();
  annotated.forEach((s, i) => {
    const e = s.firstEra;
    if (e == null) return;
    if (!byEra.has(e)) byEra.set(e, []);
    byEra.get(e).push({ name: s.name, rank: i + 1, rating: s.rating });
  });
  console.log(`\nAvg cross-era rank by debut era (lower = stronger; trend shows progress over time):`);
  const sortedEras = [...byEra.keys()].sort((a, b) => a - b);
  for (const e of sortedEras) {
    const rows = byEra.get(e);
    const avgRank = rows.reduce((a, r) => a + r.rank, 0) / rows.length;
    const avgRating = rows.reduce((a, r) => a + r.rating, 0) / rows.length;
    console.log(`  era ${String(e).padStart(2)}  n=${rows.length}  avgRank=${avgRank.toFixed(1)}  avgRating=${avgRating.toFixed(0)}`);
  }

  await writeFile(
    OUT_PATH,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      opts,
      logRange: { firstTs: matches[0].ts, lastTs: matches[matches.length - 1].ts, count: matches.length },
      eras,
      missing,
      standings: annotated,
    }, null, 2) + "\n",
    "utf8",
  );
  console.log(`\nWrote ${OUT_PATH}`);

  if (opts.append && matchEntries.length) {
    console.log(`\nAppending ${matchEntries.length} matches to ${getMatchLogPath()}...`);
    await appendMatches(matchEntries);
    console.log(`Refitting global rankings...`);
    const allLog = await loadMatches();
    const currentLog = filterCurrentVersion(allLog);
    const refreshed = buildRankings(currentLog);
    await saveRankings(refreshed);
    console.log(`Wrote ${getRankingsPath()} (${refreshed.players.length} players, ${refreshed.matchCount} matches).`);
  } else if (!opts.append) {
    console.log(`\n--no-append: ${matchEntries.length} cross-era matches not persisted.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
