#!/usr/bin/env node
// CLI for the round-robin / upset framework.
//
// Three workflows, each gated by a different flag:
//
//   1. Run a round-robin and save the pairwise matrix:
//        node tournament/rr.js run --bots A,B,C,D --seeds-per-pair 5
//      Writes tournament/round-robin.json by default; override with
//      --out PATH.
//
//   2. Analyze a saved matrix for upsets (observed vs Elo-expected):
//        node tournament/rr.js analyze
//        node tournament/rr.js analyze --in PATH --delta 0.25 --min-games 5
//      Reads tournament/rankings.json for ratings (run `npm run rank`
//      first if stale).
//
//   3. Re-roll flagged upset pairs at fresh seeds and classify:
//        node tournament/rr.js reroll --extra-seeds 10
//      Re-runs each flagged pair with a baseSeed disjoint from the
//      original. Saves a side-by-side report; matches also append to
//      matches.jsonl so PL ratings can absorb the new evidence.
//
// Subcommand-style CLI (run | analyze | reroll) instead of jamming
// it all into tournament/run.js — the workflow is enough of a
// pipeline to deserve its own surface.

import { STRATEGY_LIST, getStrategy } from "../src/strategies/index.js";
import { MAPS } from "./maps.js";
import {
  runRoundRobin,
  rerollPairs,
  pairKey,
  observedScoreA,
} from "./roundRobin.js";
import { findUpsets, classifyReroll, expectedScore } from "./upsets.js";
import {
  saveRoundRobin,
  loadRoundRobin,
  getRoundRobinPath,
} from "./rrStore.js";
import { loadRankings, ratingMap } from "./rankingsStore.js";
import { buildMatchEntry, appendMatches, getMatchLogPath } from "./matchLog.js";

const HELP = `Usage: node tournament/rr.js <subcommand> [options]

Subcommands:
  run        Run an all-pairs round-robin and save the pairwise matrix.
  analyze    Read a saved matrix and list upsets vs current ratings.
  reroll     Re-roll flagged upset pairs at fresh seeds.

Common options:
  --bots A,B,...           Strategy names to include. Default: every
                           active strategy in STRATEGY_LIST.
  --map NAME               Map preset (default: duel1). Available:
                           ${Object.keys(MAPS).join(", ")}
  --seeds-per-pair N       Matches per pair (default: 5). Pair seats
                           alternate across seeds so map asymmetry
                           doesn't favor either bot.
  --seed N                 Base seed (default: 1).
  --ticks N                Max ticks per match (default: 4000).
  --out PATH               Write matrix here (default: tournament/round-robin.json).
  --in PATH                Read matrix from here (default: tournament/round-robin.json).
  --no-save-matches        Don't append matches to matches.jsonl.
  --json                   Emit JSON instead of text.

Analyze-specific:
  --delta D                Min |observed - expected| to flag (default: 0.20).
  --min-games N            Min games per pair to flag (default: 5).
  --top N                  Show top N upsets (default: 30).

Reroll-specific:
  --extra-seeds N          Re-roll seeds per flagged pair (default: 10).
  --reroll-seed N          Base seed for re-roll. Default: original
                           baseSeed + 1_000_003 (deterministically
                           disjoint from the original seed slice).
  --top N                  Re-roll only the top N flagged pairs by
                           |delta| (default: 20). Bigger means more
                           confidence but more compute.
`;

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    console.log(HELP);
    process.exit(0);
  }
  const sub = argv[0];
  if (!["run", "analyze", "reroll"].includes(sub)) {
    console.error(`Unknown subcommand: ${sub}\n`);
    console.error(HELP);
    process.exit(1);
  }
  const opts = {
    sub,
    bots: null,
    map: "duel1",
    seedsPerPair: 5,
    seed: 1,
    ticks: 4000,
    out: null,
    in: null,
    saveMatches: true,
    json: false,
    delta: 0.20,
    minGames: 5,
    top: null,
    extraSeeds: 10,
    rerollSeed: null,
  };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--bots": opts.bots = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--map": opts.map = next(); break;
      case "--seeds-per-pair": opts.seedsPerPair = parseInt(next(), 10); break;
      case "--seed": opts.seed = parseInt(next(), 10); break;
      case "--ticks": opts.ticks = parseInt(next(), 10); break;
      case "--out": opts.out = next(); break;
      case "--in": opts.in = next(); break;
      case "--no-save-matches": opts.saveMatches = false; break;
      case "--json": opts.json = true; break;
      case "--delta": opts.delta = parseFloat(next()); break;
      case "--min-games": opts.minGames = parseInt(next(), 10); break;
      case "--top": opts.top = parseInt(next(), 10); break;
      case "--extra-seeds": opts.extraSeeds = parseInt(next(), 10); break;
      case "--reroll-seed": opts.rerollSeed = parseInt(next(), 10); break;
      case "--help": case "-h":
        console.log(HELP);
        process.exit(0);
      default:
        console.error(`Unknown option: ${a}`);
        process.exit(1);
    }
  }
  return opts;
}

function pad(s, n, right = false) {
  s = String(s);
  return right ? s.padStart(n) : s.padEnd(n);
}

function resolveStrategies(names) {
  if (!names) return STRATEGY_LIST.slice();
  try {
    return names.map(getStrategy);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

function resolveMap(name) {
  const map = MAPS[name];
  if (!map) {
    console.error(`Unknown map: ${name}. Choose from: ${Object.keys(MAPS).join(", ")}`);
    process.exit(1);
  }
  return map;
}

// ---------------------------------------------------------- run

async function cmdRun(opts) {
  const map = resolveMap(opts.map);
  const strategies = resolveStrategies(opts.bots);
  if (strategies.length < 2) {
    console.error("Need at least 2 strategies.");
    process.exit(1);
  }

  const totalPairs = (strategies.length * (strategies.length - 1)) / 2;
  const totalMatches = totalPairs * opts.seedsPerPair;
  if (!opts.json) {
    console.log(
      `Round-robin: ${strategies.length} bots · ${totalPairs} pairs · ` +
      `${opts.seedsPerPair} seeds/pair = ${totalMatches} matches · map=${opts.map}`,
    );
  }

  const matchEntries = [];
  let lastReportedPair = -1;
  const result = runRoundRobin({
    strategies,
    map,
    seedsPerPair: opts.seedsPerPair,
    baseSeed: opts.seed,
    maxTicks: opts.ticks,
    onMatch: ({ result }) => {
      if (opts.saveMatches) {
        matchEntries.push(buildMatchEntry({ map: opts.map, result }));
      }
    },
    onPair: ({ pairIndex, totalPairs }) => {
      // Throttled progress: print roughly every 1% (or every pair if
      // the field is small).
      const step = Math.max(1, Math.floor(totalPairs / 100));
      if (!opts.json && (pairIndex - lastReportedPair >= step || pairIndex === totalPairs - 1)) {
        const pct = Math.round((100 * (pairIndex + 1)) / totalPairs);
        process.stderr.write(`  pairs done: ${pairIndex + 1}/${totalPairs} (${pct}%)\r`);
        lastReportedPair = pairIndex;
      }
    },
  });
  if (!opts.json) process.stderr.write("\n");

  const target = await saveRoundRobin({
    map: opts.map,
    mapConfig: { ...map.config },
    baseSeed: opts.seed,
    seedsPerPair: opts.seedsPerPair,
    maxTicks: opts.ticks,
    bots: strategies.map((s) => s.name).sort(),
    pairs: result.pairs,
  }, opts.out);

  if (opts.saveMatches && matchEntries.length) {
    await appendMatches(matchEntries);
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      meta: {
        map: opts.map,
        bots: strategies.map((s) => s.name).sort(),
        seedsPerPair: opts.seedsPerPair,
        baseSeed: opts.seed,
        totalPairs: result.totalPairs,
        totalMatches: matchEntries.length,
        savedTo: target,
      },
    }, null, 2) + "\n");
  } else {
    console.log(`\nMatrix saved to ${target}`);
    if (opts.saveMatches) {
      console.log(`Logged ${matchEntries.length} matches to ${getMatchLogPath()}.`);
      console.log(`Run \`npm run rank\` to refresh ratings, then \`node tournament/rr.js analyze\`.`);
    }
  }
}

// ---------------------------------------------------------- analyze

function printUpsets(flagged, opts) {
  const top = opts.top ?? 30;
  const shown = flagged.slice(0, top);
  if (shown.length === 0) {
    console.log("No upsets flagged at the current thresholds.");
    return;
  }
  console.log(
    `${pad("#", 4)}  ${pad("A", 22)}  ${pad("B", 22)}  ${pad("rA", 5, true)}  ${pad("rB", 5, true)}  ${pad("obs", 6, true)}  ${pad("exp", 6, true)}  ${pad("Δ", 6, true)}  ${pad("CI", 15)}  ${pad("n", 4, true)}  ${pad("W-D-L", 8)}  stale%`,
  );
  console.log("-".repeat(126));
  shown.forEach((u, i) => {
    const ciStr = `[${u.ci.lo.toFixed(2)},${u.ci.hi.toFixed(2)}]`;
    const wdl = `${u.aWins}-${u.draws}-${u.bWins}`;
    console.log(
      `${pad(i + 1, 4)}  ${pad(u.a, 22)}  ${pad(u.b, 22)}  ${pad(u.ratingA, 5, true)}  ${pad(u.ratingB, 5, true)}  ${pad(u.observedA.toFixed(2), 6, true)}  ${pad(u.expectedA.toFixed(2), 6, true)}  ${pad((u.delta >= 0 ? "+" : "") + u.delta.toFixed(2), 6, true)}  ${pad(ciStr, 15)}  ${pad(u.games, 4, true)}  ${pad(wdl, 8)}  ${(u.stalemateRate * 100).toFixed(0)}%`,
    );
  });
  if (flagged.length > shown.length) {
    console.log(`\n…${flagged.length - shown.length} more upsets at this threshold (use --top to widen).`);
  }
}

async function cmdAnalyze(opts) {
  const matrix = await loadRoundRobin(opts.in);
  if (!matrix) {
    console.error(`No matrix at ${getRoundRobinPath(opts.in)}. Run \`node tournament/rr.js run\` first.`);
    process.exit(1);
  }
  const rankings = await loadRankings();
  if (!rankings) {
    console.error(`No tournament/rankings.json. Run \`npm run rank\` after \`rr run\` to fit ratings.`);
    process.exit(1);
  }
  const ratings = ratingMap(rankings);

  const flagged = findUpsets(matrix.pairsMap, ratings, {
    deltaThreshold: opts.delta,
    minGames: opts.minGames,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      meta: {
        matrix: getRoundRobinPath(opts.in),
        map: matrix.map,
        seedsPerPair: matrix.seedsPerPair,
        bots: matrix.bots,
        deltaThreshold: opts.delta,
        minGames: opts.minGames,
      },
      flagged,
    }, null, 2) + "\n");
    return;
  }

  console.log(
    `Upsets in ${getRoundRobinPath(opts.in)} ` +
    `(${matrix.bots.length} bots · ${matrix.pairs.length} pairs · ${matrix.seedsPerPair} seeds/pair · map=${matrix.map})`,
  );
  console.log(`Thresholds: |Δ|≥${opts.delta}, n≥${opts.minGames}, expected outside Wilson 95% CI.`);
  console.log("");
  printUpsets(flagged, opts);
}

// ---------------------------------------------------------- reroll

async function cmdReroll(opts) {
  const matrix = await loadRoundRobin(opts.in);
  if (!matrix) {
    console.error(`No matrix at ${getRoundRobinPath(opts.in)}. Run \`node tournament/rr.js run\` first.`);
    process.exit(1);
  }
  const rankings = await loadRankings();
  if (!rankings) {
    console.error(`No tournament/rankings.json. Run \`npm run rank\` first.`);
    process.exit(1);
  }
  const ratings = ratingMap(rankings);

  const flagged = findUpsets(matrix.pairsMap, ratings, {
    deltaThreshold: opts.delta,
    minGames: opts.minGames,
  });
  const top = opts.top ?? 20;
  const toReroll = flagged.slice(0, top);
  if (toReroll.length === 0) {
    console.log("No upsets to re-roll at the current thresholds.");
    return;
  }

  const map = resolveMap(matrix.map);
  // Resolve the strategy objects for each pair. Bots may have been
  // archived since the matrix was generated; surface that clearly
  // rather than crashing.
  const pairsToReroll = [];
  const skipped = [];
  for (const u of toReroll) {
    try {
      pairsToReroll.push({
        a: getStrategy(u.a),
        b: getStrategy(u.b),
        original: u,
      });
    } catch (e) {
      skipped.push({ a: u.a, b: u.b, reason: e.message });
    }
  }
  if (skipped.length && !opts.json) {
    console.warn(`Skipping ${skipped.length} pair(s) with missing strategies:`);
    for (const s of skipped) console.warn(`  ${s.a} vs ${s.b}: ${s.reason}`);
  }

  const rerollSeed = opts.rerollSeed ?? matrix.baseSeed + 1_000_003;
  if (!opts.json) {
    console.log(
      `Re-rolling ${pairsToReroll.length} flagged pair(s) at seed ${rerollSeed}, ` +
      `${opts.extraSeeds} seeds/pair (${pairsToReroll.length * opts.extraSeeds} matches).`,
    );
  }

  const matchEntries = [];
  const { pairs: rerollMatrix } = rerollPairs({
    pairsToReroll,
    map,
    seedsPerPair: opts.extraSeeds,
    baseSeed: rerollSeed,
    maxTicks: matrix.maxTicks,
    onMatch: ({ result }) => {
      if (opts.saveMatches) {
        matchEntries.push(buildMatchEntry({ map: matrix.map, result }));
      }
    },
  });

  if (opts.saveMatches && matchEntries.length) {
    await appendMatches(matchEntries);
  }

  const classified = pairsToReroll.map(({ a, b, original }) => {
    const after = rerollMatrix.get(pairKey(a.name, b.name));
    const before = matrix.pairsMap.get(pairKey(a.name, b.name));
    return {
      ...classifyReroll(before, after, ratings, { deltaThreshold: opts.delta }),
      originalGames: before.games,
      originalObservedA: original.observedA,
    };
  });
  // Sort: confirmed/amplified upsets first (most interesting), then
  // flipped, then reverted. Within each kind, by absolute after-delta.
  const order = { amplified: 0, confirmed: 1, flipped: 2, reverted: 3 };
  classified.sort((x, y) =>
    order[x.kind] - order[y.kind] ||
    Math.abs(y.after.delta) - Math.abs(x.after.delta),
  );

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      meta: {
        matrix: getRoundRobinPath(opts.in),
        rerollSeed,
        extraSeeds: opts.extraSeeds,
        rerolled: classified.length,
        skipped,
      },
      classified,
    }, null, 2) + "\n");
    return;
  }

  console.log("");
  console.log(
    `${pad("#", 4)}  ${pad("kind", 10)}  ${pad("A", 22)}  ${pad("B", 22)}  ` +
    `${pad("exp", 6, true)}  ${pad("before", 8, true)}  ${pad("after", 8, true)}  ${pad("Δafter", 7, true)}`,
  );
  console.log("-".repeat(102));
  for (let i = 0; i < classified.length; i++) {
    const c = classified[i];
    const before = `${c.before.observedA.toFixed(2)}/${c.before.games}`;
    const after = `${c.after.observedA.toFixed(2)}/${c.after.games}`;
    const dAfter = (c.after.delta >= 0 ? "+" : "") + c.after.delta.toFixed(2);
    console.log(
      `${pad(i + 1, 4)}  ${pad(c.kind, 10)}  ${pad(c.a, 22)}  ${pad(c.b, 22)}  ` +
      `${pad(c.expectedA.toFixed(2), 6, true)}  ${pad(before, 8, true)}  ${pad(after, 8, true)}  ${pad(dAfter, 7, true)}`,
    );
  }

  const counts = classified.reduce((m, c) => (m[c.kind] = (m[c.kind] ?? 0) + 1, m), {});
  console.log(
    `\nSummary: ${counts.confirmed ?? 0} confirmed, ${counts.amplified ?? 0} amplified, ` +
    `${counts.flipped ?? 0} flipped, ${counts.reverted ?? 0} reverted.`,
  );
  if (opts.saveMatches) {
    console.log(`Logged ${matchEntries.length} re-roll matches to ${getMatchLogPath()}.`);
  }
}

// ---------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.sub === "run") return cmdRun(opts);
  if (opts.sub === "analyze") return cmdAnalyze(opts);
  if (opts.sub === "reroll") return cmdReroll(opts);
}

main().catch((e) => { console.error(e); process.exit(1); });
