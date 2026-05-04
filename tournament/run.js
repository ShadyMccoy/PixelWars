#!/usr/bin/env node
// CLI entrypoint: run a headless tournament between bot strategies.
//
//   node tournament/run.js                              # all strategies, arena, 10 rounds
//   node tournament/run.js --bots Aggressive,Trinity    # just these two
//   node tournament/run.js --map royale --rounds 50     # different map / more rounds
//   node tournament/run.js --list                       # print available strategies
//   node tournament/run.js --help

import { STRATEGY_LIST, getStrategy } from "../src/strategies/index.js";
import { MAPS } from "./maps.js";
import { runTournament } from "./scheduler.js";

const HELP = `Usage: node tournament/run.js [options]

Options:
  --bots A,B,C     Comma-separated strategy names (default: all)
  --map NAME       Map preset: ${Object.keys(MAPS).join(", ")} (default: arena)
  --rounds N       Number of matches to run (default: 10)
  --ticks N        Max ticks per match (default: 4000)
  --seed N         Base seed; round R uses seed+R (default: 1)
  --json           Emit standings as JSON (skip the table)
  --verbose        Print per-match results
  --list           List available strategies and exit
  --help           Show this help
`;

function parseArgs(argv) {
  const opts = {
    bots: null,
    map: "arena",
    rounds: 10,
    ticks: 4000,
    seed: 1,
    json: false,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--bots": opts.bots = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--map": opts.map = next(); break;
      case "--rounds": opts.rounds = parseInt(next(), 10); break;
      case "--ticks": opts.ticks = parseInt(next(), 10); break;
      case "--seed": opts.seed = parseInt(next(), 10); break;
      case "--json": opts.json = true; break;
      case "--verbose": case "-v": opts.verbose = true; break;
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

function printTable(standings, meta) {
  console.log(`\nFinal standings · map=${meta.map} · rounds=${meta.rounds} · maxTicks=${meta.ticks} · seed=${meta.seed}`);
  console.log(
    `${pad("#", 4)}  ${pad("Strategy", 18)}  ${pad("Pts", 5, true)}  ${pad("Wins", 5, true)}  ${pad("Win%", 6, true)}  ${pad("AvgRank", 8, true)}  ${pad("AvgTerr", 8, true)}  ${pad("Survive%", 9, true)}`,
  );
  console.log("-".repeat(78));
  standings.forEach((s, i) => {
    console.log(
      `${pad(i + 1, 4)}  ${pad(s.name, 18)}  ${pad(s.points, 5, true)}  ${pad(s.wins, 5, true)}  ${pad((s.winRate * 100).toFixed(1) + "%", 6, true)}  ${pad(s.avgRank.toFixed(2), 8, true)}  ${pad(s.avgTerritory.toFixed(1), 8, true)}  ${pad((s.survivalRate * 100).toFixed(1) + "%", 9, true)}`,
    );
  });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const map = MAPS[opts.map];
  if (!map) {
    console.error(`Unknown map: ${opts.map}. Choose from: ${Object.keys(MAPS).join(", ")}`);
    process.exit(1);
  }

  const names = opts.bots ?? STRATEGY_LIST.map((s) => s.name);
  let strategies;
  try {
    strategies = names.map(getStrategy);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  if (strategies.length < 2) {
    console.error("Need at least 2 strategies. Use --list to see options.");
    process.exit(1);
  }

  const onMatch = opts.verbose
    ? (round, result) => {
        console.log(`Round ${round + 1} · seed=${result.seed} · ticks=${result.ticks} · ${result.endReason}`);
        result.ranking.forEach((r, i) => {
          const tag = r.survived ? "alive" : `eliminated@${r.eliminatedAt}`;
          console.log(`  ${i + 1}. ${r.strategy.padEnd(18)} terr=${String(r.territory).padStart(4)} str=${String(r.strength).padStart(6)} (${tag})`);
        });
      }
    : null;

  const { standings, results } = runTournament({
    strategies,
    map,
    rounds: opts.rounds,
    baseSeed: opts.seed,
    maxTicks: opts.ticks,
    onMatch,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify({ meta: { map: opts.map, rounds: opts.rounds, ticks: opts.ticks, seed: opts.seed }, standings, results }, null, 2) + "\n");
    return;
  }

  printTable(standings, { map: opts.map, rounds: opts.rounds, ticks: opts.ticks, seed: opts.seed });
}

main();
