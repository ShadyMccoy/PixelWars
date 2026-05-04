#!/usr/bin/env node
// CLI entrypoint: run a headless tournament between bot strategies.
//
// Pool play (default — random K strategies per match, hundreds of matches):
//   node tournament/run.js                         # all strategies, arena, K=6, 200 matches
//   node tournament/run.js --pool 8 --matches 500
//   node tournament/run.js --bots Hunter,Vampire,Trinity --pool 3 --matches 100
//
// Single-match (great for replays / hand-picked matchups):
//   node tournament/run.js --lineup Aggressive,Defender,Vampire --seed 42 --map arena
//
// Inspecting & replaying flagged matches:
//   node tournament/run.js --list-interesting
//   node tournament/run.js --replay 3
//   node tournament/run.js --replay last --verbose
//
// FFA mode (legacy: every strategy plays every match — only with small pools):
//   node tournament/run.js --pool 0 --bots A,B,C,D --rounds 30

import { STRATEGY_LIST, getStrategy } from "../src/strategies/index.js";
import { MAPS } from "./maps.js";
import { runFfaTournament, runPoolTournament } from "./scheduler.js";
import { runLeague } from "./league.js";
import { runMatch } from "./arena.js";
import { detectFlags, FLAG_TAGS } from "./flags.js";
import { loadInteresting, appendInteresting, getStorePath } from "./store.js";

const HELP = `Usage: node tournament/run.js [options]

Tournament options:
  --bots A,B,C        Comma-separated strategy names (default: all)
  --map NAME          Map preset: ${Object.keys(MAPS).join(", ")} (default: arena)
  --pool K            Strategies per match. 0 = FFA (default: 6)
  --matches M         Number of pool-play matches (default: 200)
  --rounds N          Legacy alias for --matches in FFA mode (default: 10)
  --ticks N           Max ticks per match (default: 4000)
  --seed N            Base seed (default: 1)
  --no-save           Don't auto-save flagged matches
  --json              Emit standings as JSON
  --verbose           Print per-match results

League mode (similar-skill matchups via tier-based promotion/relegation):
  --league            Run a league instead of flat pool play
  --tier-size N       Bots per tier (default: 10)
  --seasons N         Number of seasons (default: 3)
  --matches-per-season N  Matches per tier per season (default: 20)
  --promote N         Top N of each tier promote each season (default: 2)
  --relegate N        Bottom N relegate each season (default: 2)
  --bootstrap N       Pre-season pool-play matches to seed initial tiers
                      (default: 50; use 0 to skip)

Single-match / replay:
  --lineup A,B,C      Run one match with this lineup at --seed
  --replay ID|last    Replay a saved interesting match by id (or "last")
  --list-interesting  Print saved interesting matches and exit
  --flags TAG[,TAG]   Filter listed/flagged-saved matches to these tags
                      (any of: ${FLAG_TAGS.join(", ")})

Misc:
  --list              List available strategies and exit
  --help              Show this help
`;

function parseArgs(argv) {
  const opts = {
    bots: null,
    map: "arena",
    pool: 6,
    matches: null,
    rounds: null,
    ticks: 4000,
    seed: 1,
    json: false,
    verbose: false,
    save: true,
    lineup: null,
    replay: null,
    listInteresting: false,
    flagFilter: null,
    league: false,
    tierSize: 10,
    seasons: 3,
    matchesPerSeason: 20,
    promote: 2,
    relegate: 2,
    bootstrap: 50,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--bots": opts.bots = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--map": opts.map = next(); break;
      case "--pool": opts.pool = parseInt(next(), 10); break;
      case "--matches": opts.matches = parseInt(next(), 10); break;
      case "--rounds": opts.rounds = parseInt(next(), 10); break;
      case "--ticks": opts.ticks = parseInt(next(), 10); break;
      case "--seed": opts.seed = parseInt(next(), 10); break;
      case "--json": opts.json = true; break;
      case "--verbose": case "-v": opts.verbose = true; break;
      case "--no-save": opts.save = false; break;
      case "--lineup": opts.lineup = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--replay": opts.replay = next(); break;
      case "--list-interesting": opts.listInteresting = true; break;
      case "--flags": opts.flagFilter = new Set(next().split(",").map((s) => s.trim()).filter(Boolean)); break;
      case "--league": opts.league = true; break;
      case "--tier-size": opts.tierSize = parseInt(next(), 10); break;
      case "--seasons": opts.seasons = parseInt(next(), 10); break;
      case "--matches-per-season": opts.matchesPerSeason = parseInt(next(), 10); break;
      case "--promote": opts.promote = parseInt(next(), 10); break;
      case "--relegate": opts.relegate = parseInt(next(), 10); break;
      case "--bootstrap": opts.bootstrap = parseInt(next(), 10); break;
      case "--list":
        console.log(STRATEGY_LIST.map((s) => `${s.name.padEnd(18)} ${s.description ?? ""}`).join("\n"));
        process.exit(0);
      case "--help": case "-h":
        console.log(HELP);
        process.exit(0);
      default:
        console.error(`Unknown option: ${a}`);
        console.error(HELP);
        process.exit(1);
    }
  }
  return opts;
}

function pad(s, n, right = false) {
  s = String(s);
  return right ? s.padStart(n) : s.padEnd(n);
}

function printStandings(standings, meta) {
  console.log(
    `\nFinal standings · map=${meta.map} · ${meta.modeLabel} · maxTicks=${meta.ticks} · seed=${meta.seed}`,
  );
  console.log(
    `${pad("#", 4)}  ${pad("Strategy", 18)}  ${pad("PPG", 6, true)}  ${pad("Pts", 6, true)}  ${pad("Plyd", 5, true)}  ${pad("Wins", 5, true)}  ${pad("Win%", 6, true)}  ${pad("AvgRank", 8, true)}  ${pad("AvgTerr", 8, true)}  ${pad("Survive%", 9, true)}`,
  );
  console.log("-".repeat(94));
  standings.forEach((s, i) => {
    console.log(
      `${pad(i + 1, 4)}  ${pad(s.name, 18)}  ${pad(s.pointsPerGame.toFixed(2), 6, true)}  ${pad(s.points, 6, true)}  ${pad(s.played, 5, true)}  ${pad(s.wins, 5, true)}  ${pad((s.winRate * 100).toFixed(1) + "%", 6, true)}  ${pad(s.avgRank.toFixed(2), 8, true)}  ${pad(s.avgTerritory.toFixed(1), 8, true)}  ${pad((s.survivalRate * 100).toFixed(1) + "%", 9, true)}`,
    );
  });
}

function printMatchSummary(label, result, lineup) {
  console.log(`${label} · seed=${result.seed} · ticks=${result.ticks} · ${result.endReason}`);
  result.ranking.forEach((r, i) => {
    const tag = r.survived ? "alive" : `eliminated@${r.eliminatedAt}`;
    console.log(`  ${i + 1}. ${r.strategy.padEnd(18)} terr=${String(r.territory).padStart(4)} str=${String(r.strength).padStart(6)} (${tag})`);
  });
}

function buildEntry({ map, mapPreset, seed, maxTicks, lineupNames, result, flags }) {
  return {
    map: mapPreset,
    mapConfig: { ...map.config },
    startPositions: map.positions(lineupNames.length),
    seed,
    maxTicks,
    lineup: lineupNames,
    flags,
    ticks: result.ticks,
    endReason: result.endReason,
    ranking: result.ranking,
  };
}

async function maybeSaveFlagged(entries, opts) {
  if (!opts.save || entries.length === 0) return [];
  const filtered = opts.flagFilter
    ? entries.filter((e) => e.flags.some((f) => opts.flagFilter.has(f.tag)))
    : entries;
  if (filtered.length === 0) return [];
  const { added } = await appendInteresting(filtered);
  return added;
}

// ---------------------------------------------------------- list / replay

async function cmdListInteresting(opts) {
  const entries = await loadInteresting();
  const filtered = opts.flagFilter
    ? entries.filter((e) => e.flags.some((f) => opts.flagFilter.has(f.tag)))
    : entries;
  if (filtered.length === 0) {
    console.log(`No saved interesting matches in ${getStorePath()}.`);
    return;
  }
  console.log(`${filtered.length} saved interesting match${filtered.length === 1 ? "" : "es"} (${getStorePath()}):\n`);
  for (const e of filtered) {
    const tags = e.flags.map((f) => f.tag).join(",");
    console.log(`  #${e.id}  map=${e.map}  seed=${e.seed}  ticks=${e.ticks}  [${tags}]`);
    console.log(`        lineup: ${e.lineup.join(", ")}`);
    for (const f of e.flags) console.log(`        - ${f.tag}: ${f.note}`);
    console.log("");
  }
}

async function cmdReplay(opts) {
  const entries = await loadInteresting();
  if (entries.length === 0) {
    console.error("No saved matches to replay. Run a tournament first.");
    process.exit(1);
  }
  let entry;
  if (opts.replay === "last") {
    entry = entries[entries.length - 1];
  } else {
    const id = parseInt(opts.replay, 10);
    if (Number.isNaN(id)) {
      console.error(`--replay expects an integer id or "last" (got "${opts.replay}")`);
      process.exit(1);
    }
    entry = entries.find((e) => e.id === id);
    if (!entry) {
      console.error(`No saved match with id=${id}.`);
      process.exit(1);
    }
  }

  const strategies = entry.lineup.map((name) => {
    try { return getStrategy(name); }
    catch { console.error(`Saved match references missing strategy: ${name}`); process.exit(1); }
  });

  const result = runMatch({
    strategies,
    mapConfig: entry.mapConfig,
    startPositions: entry.startPositions,
    seed: entry.seed,
    maxTicks: entry.maxTicks,
  });

  console.log(`Replay #${entry.id} · saved=${entry.savedAt}`);
  console.log(`  map=${entry.map}  seed=${entry.seed}  flags=[${entry.flags.map((f) => f.tag).join(",")}]`);
  printMatchSummary(`  result`, result, entry.lineup);

  // Sanity check: replay should be bit-exact reproducible.
  const sameTicks = result.ticks === entry.ticks;
  const sameWinner = result.ranking[0]?.strategy === entry.ranking[0]?.strategy;
  if (!sameTicks || !sameWinner) {
    console.error(`\nWARNING: replay diverged from saved result (ticks ${result.ticks} vs ${entry.ticks}, winner ${result.ranking[0]?.strategy} vs ${entry.ranking[0]?.strategy}).`);
    console.error("This usually means a strategy's behavior changed since the match was saved.");
  }
}

// ---------------------------------------------------------- league

async function cmdLeague(opts) {
  const map = MAPS[opts.map];
  if (!map) {
    console.error(`Unknown map: ${opts.map}. Choose from: ${Object.keys(MAPS).join(", ")}`);
    process.exit(1);
  }

  const names = opts.bots ?? STRATEGY_LIST.map((s) => s.name);
  let strategies;
  try { strategies = names.map(getStrategy); }
  catch (e) { console.error(e.message); process.exit(1); }

  if (strategies.length < opts.tierSize) {
    console.error(`League needs at least tier-size=${opts.tierSize} bots; got ${strategies.length}.`);
    process.exit(1);
  }

  const flaggedEntries = [];
  const onMatch = (season, tier, idx, result, lineup) => {
    const lineupNames = lineup.map((s) => s.name);
    const flags = detectFlags(result, { maxTicks: opts.ticks });
    if (flags.length) {
      flaggedEntries.push(buildEntry({
        map, mapPreset: opts.map, seed: result.seed, maxTicks: opts.ticks,
        lineupNames, result, flags,
      }));
    }
    if (opts.verbose) {
      const where = season < 0 ? `Bootstrap ${idx + 1}` : `S${season + 1} T${tier + 1} M${idx + 1}`;
      printMatchSummary(where, result, lineup);
      if (flags.length) console.log(`  flags: ${flags.map((f) => f.tag).join(", ")}`);
    }
  };

  const onSeasonEnd = (seasonIdx, tiers) => {
    if (opts.json) return;
    console.log(`\n— Season ${seasonIdx + 1} of ${opts.seasons} complete —`);
    for (let t = 0; t < tiers.length; t++) {
      const top3 = tiers[t].slice(0, 3).map((s) => s.name).join(", ");
      console.log(`  Tier ${t + 1}: top → ${top3}${tiers[t].length > 3 ? "  …" : ""}`);
    }
  };

  const totalEstimated =
    opts.bootstrap +
    opts.seasons *
      Math.ceil(strategies.length / opts.tierSize) *
      opts.matchesPerSeason;
  if (!opts.json) {
    console.log(
      `Running league: ${strategies.length} bots · tier-size=${opts.tierSize} · ` +
      `seasons=${opts.seasons} · ${opts.matchesPerSeason} matches/tier/season · ` +
      `${opts.promote}↑/${opts.relegate}↓ · bootstrap=${opts.bootstrap}`,
    );
    console.log(`(~${totalEstimated} matches total)\n`);
  }

  const league = runLeague({
    strategies,
    map,
    tierSize: opts.tierSize,
    seasons: opts.seasons,
    matchesPerSeason: opts.matchesPerSeason,
    poolSize: opts.pool,
    promote: opts.promote,
    relegate: opts.relegate,
    bootstrapMatches: opts.bootstrap,
    baseSeed: opts.seed,
    maxTicks: opts.ticks,
    onMatch,
    onSeasonEnd,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      meta: {
        map: opts.map,
        ticks: opts.ticks,
        seed: opts.seed,
        tierSize: opts.tierSize,
        seasons: opts.seasons,
        matchesPerSeason: opts.matchesPerSeason,
        promote: opts.promote,
        relegate: opts.relegate,
        bootstrap: opts.bootstrap,
        pool: opts.pool,
      },
      final: league.final,
      tiers: league.tiers,
      seasons: league.seasons,
      flagged: flaggedEntries,
    }, null, 2) + "\n");
  } else {
    console.log(`\nFinal tiers (${league.tiers.length}):\n`);
    for (let t = 0; t < league.tiers.length; t++) {
      const tier = league.tiers[t];
      console.log(`Tier ${t + 1}:`);
      tier.forEach((name, i) => {
        const overall = t * opts.tierSize + i + 1;
        console.log(`  ${String(overall).padStart(3)}. ${name}`);
      });
      console.log("");
    }
    if (flaggedEntries.length) {
      console.log(`${flaggedEntries.length} match${flaggedEntries.length === 1 ? "" : "es"} flagged as interesting.`);
    } else {
      console.log(`No matches flagged as interesting.`);
    }
  }

  const added = await maybeSaveFlagged(flaggedEntries, opts);
  if (added.length && !opts.json) {
    console.log(`Saved ${added.length} new entr${added.length === 1 ? "y" : "ies"} to ${getStorePath()}.`);
    console.log(`  Replay any with: node tournament/run.js --replay <id>`);
  }
}

// ---------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.listInteresting) return cmdListInteresting(opts);
  if (opts.replay) return cmdReplay(opts);
  if (opts.league) return cmdLeague(opts);

  const map = MAPS[opts.map];
  if (!map) {
    console.error(`Unknown map: ${opts.map}. Choose from: ${Object.keys(MAPS).join(", ")}`);
    process.exit(1);
  }

  // Pool of strategies to draw from.
  const names = opts.bots ?? STRATEGY_LIST.map((s) => s.name);
  let strategies;
  try { strategies = names.map(getStrategy); }
  catch (e) { console.error(e.message); process.exit(1); }

  // Single-match path: --lineup runs one fixed match. Useful for replays of
  // hand-picked matchups and for exploring a specific seed.
  if (opts.lineup) {
    let lineup;
    try { lineup = opts.lineup.map(getStrategy); }
    catch (e) { console.error(e.message); process.exit(1); }
    if (lineup.length < 2) {
      console.error("--lineup needs at least 2 strategies.");
      process.exit(1);
    }
    const result = runMatch({
      strategies: lineup,
      mapConfig: map.config,
      startPositions: map.positions(lineup.length),
      seed: opts.seed,
      maxTicks: opts.ticks,
    });
    const flags = detectFlags(result, { maxTicks: opts.ticks });
    printMatchSummary(`Single match`, result, opts.lineup);
    if (flags.length) {
      console.log(`\nFlags:`);
      for (const f of flags) console.log(`  - ${f.tag}: ${f.note}`);
      const entry = buildEntry({ map, mapPreset: opts.map, seed: opts.seed, maxTicks: opts.ticks, lineupNames: opts.lineup, result, flags });
      const added = await maybeSaveFlagged([entry], opts);
      if (added.length) console.log(`\nSaved as #${added[0].id} in ${getStorePath()}.`);
    } else {
      console.log(`\nNo flags raised.`);
    }
    return;
  }

  if (strategies.length < 2) {
    console.error("Need at least 2 strategies. Use --list to see options.");
    process.exit(1);
  }

  const useFfa = opts.pool === 0 || opts.pool >= strategies.length;
  const matchCount = useFfa
    ? (opts.rounds ?? opts.matches ?? 10)
    : (opts.matches ?? opts.rounds ?? 200);

  const flaggedEntries = [];
  const onMatch = (idx, result, lineup) => {
    const lineupNames = lineup.map((s) => s.name);
    const flags = detectFlags(result, { maxTicks: opts.ticks });
    if (flags.length) {
      flaggedEntries.push(buildEntry({
        map, mapPreset: opts.map, seed: result.seed, maxTicks: opts.ticks,
        lineupNames, result, flags,
      }));
    }
    if (opts.verbose) {
      const label = useFfa ? `Round ${idx + 1}` : `Match ${idx + 1}`;
      printMatchSummary(label, result, lineup);
      if (flags.length) {
        console.log(`  flags: ${flags.map((f) => f.tag).join(", ")}`);
      }
    }
  };

  const params = {
    strategies, map, baseSeed: opts.seed, maxTicks: opts.ticks, onMatch,
  };
  const tournament = useFfa
    ? runFfaTournament({ ...params, rounds: matchCount })
    : runPoolTournament({ ...params, poolSize: opts.pool, matches: matchCount });

  const meta = {
    map: opts.map,
    ticks: opts.ticks,
    seed: opts.seed,
    modeLabel: useFfa
      ? `ffa · ${matchCount} rounds · ${strategies.length} bots`
      : `pool · ${matchCount} matches · K=${opts.pool} · ${strategies.length} bots`,
    rounds: matchCount,
    matches: matchCount,
    pool: useFfa ? null : opts.pool,
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      meta,
      standings: tournament.standings,
      results: tournament.results,
      flagged: flaggedEntries,
    }, null, 2) + "\n");
  } else {
    printStandings(tournament.standings, meta);
    if (flaggedEntries.length) {
      console.log(`\n${flaggedEntries.length} match${flaggedEntries.length === 1 ? "" : "es"} flagged as interesting.`);
    } else {
      console.log(`\nNo matches flagged as interesting.`);
    }
  }

  const added = await maybeSaveFlagged(flaggedEntries, opts);
  if (added.length && !opts.json) {
    console.log(`Saved ${added.length} new entr${added.length === 1 ? "y" : "ies"} to ${getStorePath()}.`);
    console.log(`  Replay any with: node tournament/run.js --replay <id>`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
