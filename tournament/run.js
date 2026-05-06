#!/usr/bin/env node
// CLI entrypoint: run a headless tournament between bot strategies.
//
// Pool play (default — random K strategies per match, hundreds of matches):
//   node tournament/run.js                         # all strategies, lab1, K=6, 200 matches
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

import { STRATEGY_LIST, ALL_STRATEGY_LIST, ARCHIVED_STRATEGY_LIST, getStrategy } from "../src/strategies/index.js";
import { MAPS } from "./maps.js";
import { runFfaTournament, runPoolTournament } from "./scheduler.js";
import { runLeague } from "./league.js";
import { runMatch } from "./arena.js";
import { detectFlags, FLAG_TAGS } from "./flags.js";
import { loadInteresting, appendInteresting, getStorePath } from "./store.js";
import { saveLeague, loadLeagues, getLeagueStorePath } from "./leagueStore.js";
import { buildMatchEntry, appendMatches, loadMatches, getMatchLogPath } from "./matchLog.js";
import { loadRankings, saveRankings, ratingMap, getRankingsPath } from "./rankingsStore.js";
import { buildRankings, filterCurrentVersion } from "./rank.js";
import { techFromPartial } from "../src/core/Tech.js";
import { writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HELP = `Usage: node tournament/run.js [options]

Tournament options:
  --bots A,B,C        Comma-separated strategy names (default: all)
  --map NAME          Map preset: ${Object.keys(MAPS).join(", ")} (default: lab1)
  --pool K            Strategies per match. 0 = FFA (default: 6)
  --matches M         Number of pool-play matches (default: 200)
  --rounds N          Legacy alias for --matches in FFA mode (default: 10)
  --ticks N           Max ticks per match (default: 4000)
  --seed N            Base seed (default: 1)
  --no-save           Don't auto-save flagged matches
  --json              Emit standings as JSON
  --verbose           Print per-match results

League mode (similar-skill matchups; tiers seeded from current ratings):
  --league            Run a league instead of flat pool play
  --tier-size N       Bots per tier (default: 10)
  --seasons N         Number of seasons (default: 3). Tiers re-seed from
                      refit ratings between seasons.
  --matches-per-season N  Matches per tier per season (default: 20)

Single-match / replay:
  --lineup A,B,C      Run one match with this lineup at --seed
  --lineup-config FILE
                      JSON file with [{strategy, tech, name}] entries.
                      Each entry's tech is a partial {move,stack,prod,atk,def}
                      object summing to ≤100; missing points spread evenly.
  --replay ID|last    Replay a saved interesting match by id (or "last")
  --list-interesting  Print saved interesting matches and exit
  --flags TAG[,TAG]   Filter listed/flagged-saved matches to these tags
                      (any of: ${FLAG_TAGS.join(", ")})

Archive (exclude weak bots from default tournament pool):
  --archive-bottom N  Archive every bot in the bottom N tiers across all
                      saved leagues (or just --map NAME's league)
  --archive-add A,B   Add specific bots to the archive
  --archive-remove A  Remove specific bots from the archive
  --archive-clear     Clear the archive (everyone competes again)
  --archive-list      Print the current archive and exit

Misc:
  --list              List active strategies and exit
  --list-all          List every strategy (active + archived) and exit
  --help              Show this help
`;

function parseArgs(argv) {
  const opts = {
    bots: null,
    map: "lab1",
    pool: 6,
    matches: null,
    rounds: null,
    ticks: 4000,
    seed: 1,
    json: false,
    verbose: false,
    save: true,
    lineup: null,
    lineupConfig: null,
    replay: null,
    listInteresting: false,
    flagFilter: null,
    league: false,
    tierSize: 10,
    seasons: 3,
    matchesPerSeason: 20,
    archiveBottom: null,
    archiveAdd: null,
    archiveRemove: null,
    archiveClear: false,
    archiveList: false,
    listAll: false,
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
      case "--lineup-config": opts.lineupConfig = next(); break;
      case "--replay": opts.replay = next(); break;
      case "--list-interesting": opts.listInteresting = true; break;
      case "--flags": opts.flagFilter = new Set(next().split(",").map((s) => s.trim()).filter(Boolean)); break;
      case "--league": opts.league = true; break;
      case "--tier-size": opts.tierSize = parseInt(next(), 10); break;
      case "--seasons": opts.seasons = parseInt(next(), 10); break;
      case "--matches-per-season": opts.matchesPerSeason = parseInt(next(), 10); break;
      case "--archive-bottom": opts.archiveBottom = parseInt(next(), 10); break;
      case "--archive-add": opts.archiveAdd = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--archive-remove": opts.archiveRemove = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--archive-clear": opts.archiveClear = true; break;
      case "--archive-list": opts.archiveList = true; break;
      case "--list":
        console.log(STRATEGY_LIST.map((s) => `${s.name.padEnd(18)} ${s.description ?? ""}`).join("\n"));
        process.exit(0);
      case "--list-all":
        opts.listAll = true; break;
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

function isNeutralTech(tech) {
  if (!tech) return true;
  return tech.move === 20 && tech.stack === 20 && tech.prod === 20 &&
         tech.atk === 20 && tech.def === 20;
}

function formatTech(tech) {
  if (!tech || isNeutralTech(tech)) return "";
  const parts = [];
  for (const k of ["move", "stack", "prod", "atk", "def"]) {
    if (tech[k] !== 20) parts.push(`${k}:${tech[k]}`);
  }
  return parts.length ? ` [${parts.join(",")}]` : "";
}

function printMatchSummary(label, result, lineup) {
  console.log(`${label} · seed=${result.seed} · ticks=${result.ticks} · ${result.endReason}`);
  result.ranking.forEach((r, i) => {
    const tag = r.survived ? "alive" : `eliminated@${r.eliminatedAt}`;
    const display = (r.entryName || r.strategy) + formatTech(r.tech);
    console.log(`  ${i + 1}. ${display.padEnd(28)} terr=${String(r.territory).padStart(4)} str=${String(r.strength).padStart(6)} (${tag})`);
  });
}

function buildEntry({ map, mapPreset, seed, maxTicks, lineupNames, result, flags }) {
  // Per-slot tech, ordered by original lineup slot, recovered from
  // the ranking (which carries tech and slot index). Lets replays
  // reconstitute the exact tech loadout used.
  const techBySlot = new Array(lineupNames.length);
  for (const r of result.ranking) {
    if (r.slot != null) techBySlot[r.slot] = r.tech;
  }
  return {
    map: mapPreset,
    mapConfig: { ...map.config },
    startPositions: map.positions(lineupNames.length),
    seed,
    maxTicks,
    lineup: lineupNames,
    lineupTech: techBySlot,
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

  // Replay-time entry resolution: legacy saved matches stored only
  // strategy names. Newer matches also store a per-slot tech. Pass
  // tech through when present so replays of tech-laden matches are
  // bit-exact.
  const lineupEntries = entry.lineup.map((name, i) => {
    let strategy;
    try { strategy = getStrategy(name); }
    catch { console.error(`Saved match references missing strategy: ${name}`); process.exit(1); }
    if (entry.lineupTech && entry.lineupTech[i]) {
      return { strategy, tech: entry.lineupTech[i], name };
    }
    return strategy;
  });

  const result = runMatch({
    strategies: lineupEntries,
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

// ---------------------------------------------------------- archive

const ARCHIVE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..", "src", "strategies", "archive.js",
);

async function writeArchive(names) {
  const sorted = [...new Set(names)].sort();
  const body =
`// Archived bots — excluded from new tournaments and the HUD strategy
// dropdown, but still loadable by name for replays and league watching.
//
// This file is auto-managed by:
//   node tournament/run.js --archive-bottom N      # archive bottom N tiers
//   node tournament/run.js --archive-clear         # remove all
//   node tournament/run.js --archive-add A,B,C
//   node tournament/run.js --archive-remove A,B,C
//
// You can also hand-edit it.
export const ARCHIVED = [
${sorted.map((n) => `  ${JSON.stringify(n)},`).join("\n")}
];
`;
  await writeFile(ARCHIVE_PATH, body, "utf8");
  return sorted;
}

function currentArchive() {
  return ARCHIVED_STRATEGY_LIST.map((s) => s.name);
}

async function cmdArchiveList(opts) {
  const cur = currentArchive();
  if (cur.length === 0) {
    console.log("Archive is empty — every strategy competes by default.");
    return;
  }
  console.log(`Archived (${cur.length}):`);
  for (const name of cur) console.log(`  ${name}`);
}

async function cmdArchiveClear(opts) {
  await writeArchive([]);
  console.log(`Archive cleared. ${ALL_STRATEGY_LIST.length} active strategies.`);
}

async function cmdArchiveAdd(opts) {
  const cur = new Set(currentArchive());
  const validNames = new Set(ALL_STRATEGY_LIST.map((s) => s.name));
  const added = [];
  for (const name of opts.archiveAdd) {
    if (!validNames.has(name)) {
      console.error(`Unknown strategy: ${name}`);
      process.exit(1);
    }
    if (!cur.has(name)) { cur.add(name); added.push(name); }
  }
  const final = await writeArchive([...cur]);
  console.log(`Archived ${added.length} new bot${added.length === 1 ? "" : "s"} (${final.length} total): ${added.join(", ") || "(none new)"}`);
}

async function cmdArchiveRemove(opts) {
  const cur = new Set(currentArchive());
  const removed = [];
  for (const name of opts.archiveRemove) {
    if (cur.delete(name)) removed.push(name);
  }
  const final = await writeArchive([...cur]);
  console.log(`Removed ${removed.length} bot${removed.length === 1 ? "" : "s"} from archive (${final.length} remain): ${removed.join(", ") || "(none)"}`);
}

async function cmdArchiveBottom(opts) {
  const N = opts.archiveBottom;
  if (!Number.isFinite(N) || N <= 0) {
    console.error(`--archive-bottom needs a positive integer; got ${opts.archiveBottom}`);
    process.exit(1);
  }
  const leagues = await loadLeagues();
  if (leagues.length === 0) {
    console.error(`No saved leagues. Run \`node tournament/run.js --league\` first.`);
    process.exit(1);
  }
  // Filter to a single map if --map was specified explicitly. Default
  // (opts.map=="arena") still triggers the filter though, which is the
  // wrong default for archive-bottom; we want union of all leagues. Use
  // a sentinel: only filter if the user passed --map explicitly. Lacking
  // that detection here, we just take the union of all saved leagues.
  const sources = leagues;

  const archive = new Set();
  const breakdown = [];
  for (const league of sources) {
    if (league.tiers.length < N) {
      console.error(`League "${league.map}" only has ${league.tiers.length} tiers; need at least ${N}.`);
      process.exit(1);
    }
    const bottom = league.tiers.slice(league.tiers.length - N).flat();
    breakdown.push({ map: league.map, count: bottom.length });
    for (const name of bottom) archive.add(name);
  }

  // Don't accidentally archive the manual core strategies that someone
  // may want to keep around for the HUD even if they're weak (e.g.
  // Hunter is intentionally simple). Honor only the data — let the user
  // hand-edit if they want exceptions.

  const final = await writeArchive([...archive]);
  console.log(`Archived ${final.length} bots from the bottom ${N} tier${N === 1 ? "" : "s"} of each league:`);
  for (const b of breakdown) console.log(`  ${b.map.padEnd(8)} contributed ${b.count} bots`);
  console.log(`\nActive pool now: ${ALL_STRATEGY_LIST.length - final.length} bots`);
  console.log(`(re-import the strategies module — i.e. re-run anything else — to pick up the change)`);
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

  // Seed initial tier order from the global ranking. Bots without a
  // rating (new bots, or first-ever league run) start at the median
  // rating so they slot mid-pack and let PL pull them to true skill.
  const seedRankings = await loadRankings();
  const seedRatings = ratingMap(seedRankings);
  const unrated = strategies.filter((s) => !seedRatings.has(s.name)).map((s) => s.name);
  if (!opts.json) {
    if (seedRankings) {
      const ratedCount = strategies.length - unrated.length;
      console.log(
        `Seeding tiers from ${getRankingsPath().split("/").slice(-2).join("/")} ` +
        `(${ratedCount} rated, ${unrated.length} new at default).`,
      );
      if (unrated.length && unrated.length <= 12) {
        console.log(`  New: ${unrated.join(", ")}`);
      }
    } else {
      console.log(`No rankings.json yet — all bots seeded at default rating.`);
    }
  }

  const flaggedEntries = [];
  const matchEntries = [];
  // Pre-load the existing match log once. The refit between seasons fits
  // PL on (existing log) ∪ (this run's matches so far), filtered to the
  // current rules version.
  const priorLog = filterCurrentVersion(await loadMatches());

  const onMatch = (season, tier, idx, result, lineup) => {
    const lineupNames = lineup.map((s) => s.name);
    matchEntries.push(buildMatchEntry({ map: opts.map, result }));
    const flags = detectFlags(result, { maxTicks: opts.ticks });
    if (flags.length) {
      flaggedEntries.push(buildEntry({
        map, mapPreset: opts.map, seed: result.seed, maxTicks: opts.ticks,
        lineupNames, result, flags,
      }));
    }
    if (opts.verbose) {
      const where = `S${season + 1} T${tier + 1} M${idx + 1}`;
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

  const onSeasonRefit = (seasonIdx) => {
    const fresh = buildRankings([...priorLog, ...matchEntries]);
    if (!opts.json) {
      const top3 = fresh.players.slice(0, 3).map((p) => `${p.name}(${p.rating})`).join(", ");
      console.log(`  refit → top: ${top3}  (${fresh.iterations} iter, conv=${fresh.converged})`);
    }
    return ratingMap(fresh);
  };

  const totalEstimated =
    opts.seasons *
    Math.ceil(strategies.length / opts.tierSize) *
    opts.matchesPerSeason;
  if (!opts.json) {
    console.log(
      `Running league: ${strategies.length} bots · tier-size=${opts.tierSize} · ` +
      `seasons=${opts.seasons} · ${opts.matchesPerSeason} matches/tier/season`,
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
    baseSeed: opts.seed,
    maxTicks: opts.ticks,
    seedRatings,
    onMatch,
    onSeasonEnd,
    onSeasonRefit,
  });

  // Final refit, including this run's matches. This is the canonical
  // post-run ranking; we write it to rankings.json so the next league
  // (and the browser) can read it.
  const finalRankings = buildRankings([...priorLog, ...matchEntries]);

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      meta: {
        map: opts.map,
        ticks: opts.ticks,
        seed: opts.seed,
        tierSize: opts.tierSize,
        seasons: opts.seasons,
        matchesPerSeason: opts.matchesPerSeason,
        pool: opts.pool,
      },
      final: league.final,
      tiers: league.tiers,
      ratings: finalRankings.players,
      flagged: flaggedEntries,
    }, null, 2) + "\n");
  } else {
    console.log(`\nFinal tiers (${league.tiers.length}):\n`);
    for (let t = 0; t < league.tiers.length; t++) {
      const tier = league.tiers[t];
      console.log(`Tier ${t + 1}:`);
      tier.forEach((name, i) => {
        const overall = t * opts.tierSize + i + 1;
        const r = finalRankings.players.find((p) => p.name === name);
        const tag = r ? `  (${r.rating})` : "";
        console.log(`  ${String(overall).padStart(3)}. ${name}${tag}`);
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

  if (matchEntries.length) {
    await appendMatches(matchEntries);
    if (!opts.json) console.log(`Logged ${matchEntries.length} matches to ${getMatchLogPath()}.`);
  }

  await saveRankings(finalRankings);
  if (!opts.json) console.log(`Rankings saved to ${getRankingsPath()}: ${finalRankings.players.length} players, ${finalRankings.matchCount} matches.`);

  // Legacy: the browser League viewer still reads leagues.json. Keep
  // writing the final tier composition there until the UI moves to
  // rankings.json.
  await saveLeague({
    map: opts.map,
    mapConfig: { ...map.config },
    tierSize: opts.tierSize,
    seasons: opts.seasons,
    matchesPerSeason: opts.matchesPerSeason,
    poolSize: opts.pool,
    tiers: league.tiers,
    final: league.final,
  });
  if (!opts.json) console.log(`League snapshot saved to ${getLeagueStorePath()}.`);
}

// ---------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.listAll) {
    console.log(ALL_STRATEGY_LIST.map((s) => {
      const tag = ARCHIVED_STRATEGY_LIST.includes(s) ? " [archived]" : "";
      return `${s.name.padEnd(18)}${tag.padEnd(12)} ${s.description ?? ""}`;
    }).join("\n"));
    return;
  }
  if (opts.listInteresting) return cmdListInteresting(opts);
  if (opts.archiveList) return cmdArchiveList(opts);
  if (opts.archiveClear) return cmdArchiveClear(opts);
  if (opts.archiveAdd) return cmdArchiveAdd(opts);
  if (opts.archiveRemove) return cmdArchiveRemove(opts);
  if (opts.archiveBottom != null) return cmdArchiveBottom(opts);
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

  // Single-match path: --lineup or --lineup-config runs one fixed
  // match. Useful for replays of hand-picked matchups and for
  // exploring a specific seed.
  if (opts.lineup || opts.lineupConfig) {
    let entries;
    let lineupNames;
    try {
      if (opts.lineupConfig) {
        const raw = await readFile(opts.lineupConfig, "utf8");
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error("lineup-config must be a JSON array");
        entries = parsed.map((row) => ({
          strategy: getStrategy(row.strategy),
          tech: techFromPartial(row.tech ?? {}),
          name: row.name ?? row.strategy,
        }));
        lineupNames = entries.map((e) => e.name);
      } else {
        const strategies = opts.lineup.map(getStrategy);
        entries = strategies;
        lineupNames = opts.lineup;
      }
    } catch (e) { console.error(e.message); process.exit(1); }
    if (entries.length < 2) {
      console.error("Lineup needs at least 2 entries.");
      process.exit(1);
    }
    const result = runMatch({
      strategies: entries,
      mapConfig: map.config,
      startPositions: map.positions(entries.length),
      seed: opts.seed,
      maxTicks: opts.ticks,
    });
    const flags = detectFlags(result, { maxTicks: opts.ticks });
    printMatchSummary(`Single match`, result, lineupNames);
    if (flags.length) {
      console.log(`\nFlags:`);
      for (const f of flags) console.log(`  - ${f.tag}: ${f.note}`);
      const entry = buildEntry({ map, mapPreset: opts.map, seed: opts.seed, maxTicks: opts.ticks, lineupNames, result, flags });
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
  const matchEntries = [];
  const onMatch = (idx, result, lineup) => {
    const lineupNames = lineup.map((s) => s.name);
    matchEntries.push(buildMatchEntry({ map: opts.map, result }));
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

  if (matchEntries.length) {
    await appendMatches(matchEntries);
    if (!opts.json) console.log(`Logged ${matchEntries.length} matches to ${getMatchLogPath()}. Run \`npm run rank\` to refresh rankings.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
