#!/usr/bin/env node
// Cross-strategy validation for techs.
//
// Builds a pool of (strategy, tech) entries — every strategy paired
// with every tech archetype — and runs pool matches sampling K entries
// at a time. Aggregates winrates per tech archetype across all
// participating strategies. If one archetype dominates the meta, it's
// still OP at the current slopes.
//
// Usage:
//   node tournament/validate-cross.js --matches 300 --pool 4 --ticks 2000

import { runMatch } from "./arena.js";
import { MAPS } from "./maps.js";
import { getStrategy } from "../src/strategies/index.js";
import { techFromPartial, NEUTRAL_TECH } from "../src/core/Tech.js";
import { mulberry32 } from "../src/core/rng.js";

const HELP = `Usage: node tournament/validate-cross.js [options]
  --strategies LIST   Comma-separated bots (default: a curated 7-bot set)
  --pool K            Entries per match (default 4)
  --matches M         Total matches (default 300)
  --ticks N           Max ticks (default 2000)
  --seed N            Base seed (default 1)
  --map NAME          Map preset (default lab1)
  --help              This message
`;

const DEFAULT_STRATEGIES = [
  "Berserker", "Turtle", "Hunter", "SlowAndSteady",
  "Swarm", "Aggressive", "Defender",
];

const ARCHETYPES = [
  { name: "neutral",  tech: { ...NEUTRAL_TECH } },
  { name: "blitz",    tech: techFromPartial({ move: 100 }) },
  { name: "hoarder",  tech: techFromPartial({ stack: 100 }) },
  { name: "engine",   tech: techFromPartial({ prod: 100 }) },
  { name: "berserk",  tech: techFromPartial({ atk: 100 }) },
  { name: "fortress", tech: techFromPartial({ def: 100 }) },
];

function parseArgs(argv) {
  const opts = {
    strategies: DEFAULT_STRATEGIES,
    pool: 4,
    matches: 300,
    ticks: 2000,
    seed: 1,
    map: "lab1",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--strategies": opts.strategies = next().split(",").map((s) => s.trim()); break;
      case "--pool": opts.pool = parseInt(next(), 10); break;
      case "--matches": opts.matches = parseInt(next(), 10); break;
      case "--ticks": opts.ticks = parseInt(next(), 10); break;
      case "--seed": opts.seed = parseInt(next(), 10); break;
      case "--map": opts.map = next(); break;
      case "--help": case "-h": console.log(HELP); process.exit(0);
      default: console.error(`Unknown option: ${a}`); console.error(HELP); process.exit(1);
    }
  }
  return opts;
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

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const map = MAPS[opts.map];
  if (!map) { console.error(`Unknown map: ${opts.map}`); process.exit(1); }

  // Build entries: every strategy × every archetype.
  const entries = [];
  for (const sname of opts.strategies) {
    let strategy;
    try { strategy = getStrategy(sname); }
    catch (e) { console.error(e.message); process.exit(1); }
    for (const arc of ARCHETYPES) {
      entries.push({
        strategy,
        tech: arc.tech,
        archetype: arc.name,
        name: `${sname}-${arc.name}`,
      });
    }
  }

  console.log(`Cross-strategy validation: ${opts.strategies.length} strategies × ${ARCHETYPES.length} archetypes = ${entries.length} entries`);
  console.log(`Running ${opts.matches} ${opts.pool}-bot pool matches on ${opts.map}...\n`);

  // Per-archetype aggregates (across all strategies).
  const stats = new Map(ARCHETYPES.map((a) => [a.name, {
    name: a.name, played: 0, wins: 0, totalRank: 0, survived: 0,
    totalTerritory: 0, points: 0,
  }]));

  const rng = mulberry32(opts.seed ^ 0x5ec5);
  const positions = map.positions(opts.pool);

  for (let m = 0; m < opts.matches; m++) {
    const lineup = sample(entries, opts.pool, rng);
    const result = runMatch({
      strategies: lineup.map(({ strategy, tech, name }) => ({ strategy, tech, name })),
      mapConfig: map.config,
      startPositions: positions,
      seed: opts.seed + m,
      maxTicks: opts.ticks,
    });
    const slots = result.ranking.length;
    for (let i = 0; i < slots; i++) {
      const r = result.ranking[i];
      const lineupEntry = lineup.find((e) => e.name === r.entryName);
      if (!lineupEntry) continue;
      const s = stats.get(lineupEntry.archetype);
      s.played++;
      s.totalRank += i + 1;
      s.points += slots - 1 - i;
      s.totalTerritory += r.territory;
      if (r.survived) s.survived++;
      if (i === 0 && r.survived) s.wins++;
    }
  }

  const rows = [...stats.values()]
    .map((s) => ({
      ...s,
      avgRank: s.played ? s.totalRank / s.played : 0,
      winRate: s.played ? s.wins / s.played : 0,
      survivalRate: s.played ? s.survived / s.played : 0,
      pointsPerGame: s.played ? s.points / s.played : 0,
    }))
    .sort((a, b) => b.pointsPerGame - a.pointsPerGame);

  console.log(`${"#".padStart(3)}  ${"archetype".padEnd(10)}  ${"PPG".padStart(6)}  ${"Plyd".padStart(5)}  ${"Win%".padStart(6)}  ${"AvgRank".padStart(8)}  ${"Surv%".padStart(6)}`);
  console.log("-".repeat(58));
  rows.forEach((r, i) => {
    console.log(`${String(i + 1).padStart(3)}  ${r.name.padEnd(10)}  ${r.pointsPerGame.toFixed(2).padStart(6)}  ${String(r.played).padStart(5)}  ${(r.winRate * 100).toFixed(1).padStart(5)}%  ${r.avgRank.toFixed(2).padStart(8)}  ${(r.survivalRate * 100).toFixed(1).padStart(5)}%`);
  });

  // Spread metric: max-min PPG. Smaller = more balanced.
  const ppgs = rows.map((r) => r.pointsPerGame);
  const spread = Math.max(...ppgs) - Math.min(...ppgs);
  console.log(`\nPPG spread: ${spread.toFixed(3)}  (smaller = more balanced; 0 = all archetypes equal)`);
  console.log(`Mean PPG:   ${(ppgs.reduce((a,b)=>a+b,0)/ppgs.length).toFixed(3)}`);
}

main();
