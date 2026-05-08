#!/usr/bin/env node
// One-off experiment to stabilize the top of the leaderboard.
//
// The current rankings.json shows the top 5 bots all sitting at 50-70
// matches each — far less exposure than the established field (200+
// matches). With the synthetic-RD floor previously kicking in at 49
// plays, the matchmaker gave them no extra airtime once they cleared
// that bar, so the "who is #1" question stayed noisy.
//
// This script picks the top-N rated bots with fewer than MAX_MATCHES
// matches, and runs additional matches anchored on each one against a
// random sample of the established field. Results are appended to
// matches.jsonl and rankings.json is refit. Run it once after a season
// when the top of the board looks ambiguous.
//
// Usage:
//   node tournament/exp-top-uncertainty.js
//   node tournament/exp-top-uncertainty.js --top 8 --matches-per 40
//   node tournament/exp-top-uncertainty.js --max-matches 100 --map lab1

import { STRATEGY_LIST, getStrategy } from "../src/strategies/index.js";
import { MAPS } from "./maps.js";
import { runMatch } from "./arena.js";
import { mulberry32 } from "../src/core/rng.js";
import { loadRankings, saveRankings, getRankingsPath } from "./rankingsStore.js";
import { buildMatchEntry, appendMatches, loadMatches, getMatchLogPath } from "./matchLog.js";
import { buildRankings, filterCurrentVersion } from "./rank.js";

function parseArgs(argv) {
  const opts = {
    top: 5,
    matchesPer: 40,
    maxMatches: 100,
    map: "lab1",
    seed: Date.now() & 0x7fffffff,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--top": opts.top = parseInt(next(), 10); break;
      case "--matches-per": opts.matchesPer = parseInt(next(), 10); break;
      case "--max-matches": opts.maxMatches = parseInt(next(), 10); break;
      case "--map": opts.map = next(); break;
      case "--seed": opts.seed = parseInt(next(), 10); break;
      default: throw new Error(`Unknown option: ${a}`);
    }
  }
  return opts;
}

function pickRandom(items, k, rng, exclude = new Set()) {
  const pool = items.filter((s) => !exclude.has(s.name));
  if (pool.length < k) throw new Error(`Need ${k} candidates, only ${pool.length} available`);
  const out = [];
  for (let i = 0; i < k; i++) {
    const j = Math.floor(rng() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const map = MAPS[opts.map];
  if (!map) throw new Error(`Unknown map: ${opts.map}. Choices: ${Object.keys(MAPS).join(", ")}`);

  const rankings = await loadRankings();
  if (!rankings) throw new Error("No rankings.json — run a season first.");

  const activeNames = new Set(STRATEGY_LIST.map((s) => s.name));
  const eligible = rankings.players.filter((p) => activeNames.has(p.name));

  // Top-N rated bots that haven't accumulated enough matches yet.
  const targets = eligible
    .filter((p) => (p.matches ?? 0) < opts.maxMatches)
    .slice(0, opts.top);
  if (!targets.length) {
    console.log(`No active bots with rating below max-matches=${opts.maxMatches}. Nothing to do.`);
    return;
  }

  // "Established" field for filler seats: active bots with a healthy
  // play count, sorted by match count desc so the most-calibrated bots
  // are favored. Top-of-board newcomers are NOT in this pool — they
  // each need their own anchor matches.
  const targetNames = new Set(targets.map((t) => t.name));
  const established = eligible
    .filter((p) => !targetNames.has(p.name) && (p.matches ?? 0) >= 50)
    .map((p) => STRATEGY_LIST.find((s) => s.name === p.name))
    .filter(Boolean);

  const k = map.players;
  if (established.length < k - 1) {
    throw new Error(`Need at least ${k - 1} established opponents; only have ${established.length}`);
  }

  console.log(`Targets (top ${targets.length}, matches < ${opts.maxMatches}):`);
  for (const t of targets) {
    console.log(`  ${t.name.padEnd(24)} rating=${t.rating}  matches=${t.matches}`);
  }
  console.log(`Established opponent pool: ${established.length} bots`);
  console.log(`Per target: ${opts.matchesPer} matches on ${opts.map} (K=${k})\n`);

  const positions = map.positions(k);
  const seedRng = mulberry32(opts.seed);
  const matchEntries = [];
  const t0 = Date.now();

  for (const target of targets) {
    const targetStrategy = getStrategy(target.name);
    if (!targetStrategy) {
      console.warn(`  skip ${target.name}: not loadable`);
      continue;
    }
    let won = 0;
    let stale = 0;
    for (let i = 0; i < opts.matchesPer; i++) {
      const fillers = pickRandom(established, k - 1, seedRng);
      const lineup = [targetStrategy, ...fillers];
      // Fisher-Yates shuffle so seat assignment doesn't bias outcomes.
      for (let j = lineup.length - 1; j > 0; j--) {
        const idx = Math.floor(seedRng() * (j + 1));
        [lineup[j], lineup[idx]] = [lineup[idx], lineup[j]];
      }
      const seed = (opts.seed + matchEntries.length * 7919) >>> 0;
      const result = runMatch({
        strategies: lineup,
        mapConfig: map.config,
        startPositions: positions,
        seed,
        maxTicks: 4000,
      });
      const top = result.ranking[0];
      if (top?.strategy === target.name && top.survived && !result.stalemate) won++;
      if (result.stalemate) stale++;
      matchEntries.push(buildMatchEntry({
        map: { name: map.name, config: map.config },
        result: { ...result, seed },
      }));
    }
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  ${target.name.padEnd(24)} done: ${won}/${opts.matchesPer} wins, ${stale} stale  [${dt}s elapsed]`);
  }

  console.log(`\nAppending ${matchEntries.length} matches to ${getMatchLogPath()}...`);
  await appendMatches(matchEntries);

  console.log(`Refitting rankings...`);
  const allLog = await loadMatches();
  const currentLog = filterCurrentVersion(allLog);
  const refreshed = buildRankings(currentLog);
  await saveRankings(refreshed);
  console.log(`Wrote ${getRankingsPath()} (${refreshed.players.length} players, ${refreshed.matchCount} matches).\n`);

  console.log(`Top 12 after refit:`);
  for (const p of refreshed.players.slice(0, 12)) {
    const before = rankings.players.find((q) => q.name === p.name);
    const dRating = before ? p.rating - before.rating : 0;
    const dMatches = before ? p.matches - (before.matches ?? 0) : p.matches;
    const arrow = dRating > 0 ? `+${dRating}` : dRating < 0 ? `${dRating}` : "  0";
    console.log(`  ${String(p.rating).padStart(5)} (${arrow.padStart(4)})  ${p.name.padEnd(24)} (${p.matches}m, +${dMatches})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
