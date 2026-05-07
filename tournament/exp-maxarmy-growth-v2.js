#!/usr/bin/env node
// v2: same 3x2 sweep as exp-maxarmy-growth.js but uses the info-gain
// matchmaker (priors loaded from rankings.json) so similarly-rated bots
// fight each other instead of random K=6 draws. v1 had Pacifists in
// almost every lineup, which crushed the Conqueror lineage's signal.
//
// Output: tournament/exp-maxarmy-growth-v2.json + console comparison.

import { STRATEGY_LIST } from "../src/strategies/index.js";
import { MAPS } from "./maps.js";
import { runRatingTournament } from "./scheduler.js";
import { buildMatchEntry, appendMatches, getMatchLogPath } from "./matchLog.js";
import { loadRankings, priorMap } from "./rankingsStore.js";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(HERE, "exp-maxarmy-growth-v2.json");

const BASE_MAP = MAPS.lab1;
const POOL_SIZE = 6;
const MATCHES_PER_CONFIG = 600; // doubled to compensate for info-gain anchoring
const MAX_TICKS = 4000;
const BASE_SEED = 1;

const MAX_ARMY_GRID = [6, 12, 20];
const GROWTH_GRID = [1.0, 1.8];

function configTag(maxArmy, growth) {
  return `v3-exp2_a${maxArmy}_g${growth.toFixed(1)}`;
}

function makeMap(maxArmy, growth) {
  return {
    name: `${BASE_MAP.name}_a${maxArmy}_g${growth.toFixed(1)}`,
    config: { ...BASE_MAP.config, maxArmy, growth },
    positions: BASE_MAP.positions,
  };
}

function pad(s, n, right = false) {
  s = String(s);
  return right ? s.padStart(n) : s.padEnd(n);
}

async function runConfig(strategies, priors, maxArmy, growth) {
  const map = makeMap(maxArmy, growth);
  const tag = configTag(maxArmy, growth);
  const matchEntries = [];
  const t0 = Date.now();

  const onMatch = (idx, result) => {
    const entry = buildMatchEntry({ map: map.name, result });
    entry.rulesVersion = tag;
    matchEntries.push(entry);
  };

  const tournament = runRatingTournament({
    strategies,
    map,
    poolSize: POOL_SIZE,
    matches: MATCHES_PER_CONFIG,
    baseSeed: BASE_SEED,
    maxTicks: MAX_TICKS,
    onMatch,
    priors,
  });

  const dt = Date.now() - t0;
  await appendMatches(matchEntries);

  return {
    config: { maxArmy, growth },
    tag,
    elapsedMs: dt,
    matchCount: matchEntries.length,
    standings: tournament.standings.map((s) => ({
      name: s.name,
      rating: +s.rating.toFixed(0),
      rd: +s.rd.toFixed(0),
      played: s.played,
      wins: s.wins,
      winRate: +(s.winRate * 100).toFixed(1),
      avgRank: +s.avgRank.toFixed(2),
    })),
  };
}

function printConfigHeader(cfg) {
  console.log(
    `\n=== maxArmy=${cfg.config.maxArmy}  growth=${cfg.config.growth.toFixed(1)}  ` +
      `(${cfg.matchCount} matches in ${(cfg.elapsedMs / 1000).toFixed(1)}s, tag=${cfg.tag}) ===`,
  );
  console.log(
    `${pad("#", 4)}  ${pad("Strategy", 24)}  ${pad("Rating", 7, true)}  ${pad("RD", 5, true)}  ` +
      `${pad("Plyd", 5, true)}  ${pad("Wins", 5, true)}  ${pad("Win%", 6, true)}  ${pad("AvgRank", 8, true)}`,
  );
  console.log("-".repeat(78));
}

function printTopN(standings, n) {
  for (let i = 0; i < Math.min(n, standings.length); i++) {
    const s = standings[i];
    console.log(
      `${pad(i + 1, 4)}  ${pad(s.name, 24)}  ${pad(s.rating, 7, true)}  ${pad(s.rd, 5, true)}  ` +
        `${pad(s.played, 5, true)}  ${pad(s.wins, 5, true)}  ${pad(s.winRate.toFixed(1) + "%", 6, true)}  ${pad(s.avgRank.toFixed(2), 8, true)}`,
    );
  }
}

function bucketAverages(standings, strategies) {
  const techByName = new Map();
  for (const s of strategies) techByName.set(s.name, s.tech ?? null);

  function bucket(t) {
    if (!t) return "neutral";
    const m = t.move ?? 20, st = t.stack ?? 20;
    if (m >= 40 && st >= 40) return "high-move/high-stack";
    if (m >= 40) return "high-move";
    if (st >= 40) return "high-stack";
    if (m === 20 && st === 20 && (t.prod ?? 20) === 20 && (t.atk ?? 20) === 20 && (t.def ?? 20) === 20) return "neutral";
    return "mixed";
  }

  const buckets = new Map();
  for (const s of standings) {
    const t = techByName.get(s.name);
    const k = bucket(t);
    if (!buckets.has(k)) buckets.set(k, { sum: 0, n: 0 });
    const b = buckets.get(k);
    b.sum += s.rating;
    b.n++;
  }
  return [...buckets.entries()]
    .map(([k, v]) => ({ key: k, count: v.n, avg: Math.round(v.sum / v.n) }))
    .sort((a, b) => b.avg - a.avg);
}

async function main() {
  const strategies = STRATEGY_LIST;
  const seedRankings = await loadRankings();
  const priors = seedRankings ? priorMap(seedRankings) : null;
  if (!priors) {
    console.error("No rankings.json — info-gain priors unavailable.");
    process.exit(1);
  }
  const knownNames = new Set(Object.keys(priors));
  const newCount = strategies.filter((s) => !knownNames.has(s.name)).length;
  console.log(
    `v2 sweep: ${MAX_ARMY_GRID.length}×${GROWTH_GRID.length} configs, ` +
      `${MATCHES_PER_CONFIG} matches/config, K=${POOL_SIZE}, ${strategies.length} bots ` +
      `(${newCount} unrated), info-gain matchmaker, base map=${BASE_MAP.name}.`,
  );
  console.log(`Match log: ${getMatchLogPath()} (each config tagged separately).`);

  const configs = [];
  for (const growth of GROWTH_GRID) {
    for (const maxArmy of MAX_ARMY_GRID) {
      console.log(
        `\n→ running maxArmy=${maxArmy} growth=${growth.toFixed(1)} ...`,
      );
      const cfg = await runConfig(strategies, priors, maxArmy, growth);
      configs.push(cfg);
      printConfigHeader(cfg);
      printTopN(cfg.standings, 20);
    }
  }

  console.log(`\n=== Average rating by tech bucket ===`);
  console.log(
    `${pad("Config", 16)}  ${pad("high-move", 12, true)}  ${pad("high-stack", 12, true)}  ${pad("neutral", 12, true)}  ${pad("mixed", 12, true)}`,
  );
  for (const cfg of configs) {
    const buckets = bucketAverages(cfg.standings, strategies);
    const map = Object.fromEntries(buckets.map((b) => [b.key, b]));
    const cell = (k) => map[k] ? `${map[k].avg} (${map[k].count})` : "-";
    const tag = `a${cfg.config.maxArmy} g${cfg.config.growth.toFixed(1)}`;
    console.log(
      `${pad(tag, 16)}  ${pad(cell("high-move"), 12, true)}  ${pad(cell("high-stack"), 12, true)}  ${pad(cell("neutral"), 12, true)}  ${pad(cell("mixed"), 12, true)}`,
    );
  }

  // Top Conqueror_g* tracking across configs
  console.log(`\n=== Top 5 Conqueror_g* ratings per config ===`);
  for (const cfg of configs) {
    const tag = `a${cfg.config.maxArmy} g${cfg.config.growth.toFixed(1)}`;
    const conq = cfg.standings.filter((s) => s.name.startsWith("Conqueror_g")).slice(0, 5);
    const txt = conq.map((c) => `${c.name}:${c.rating}`).join(", ");
    console.log(`${pad(tag, 12)} ${txt}`);
  }

  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        meta: {
          generatedAt: new Date().toISOString(),
          baseMap: BASE_MAP.name,
          poolSize: POOL_SIZE,
          matchesPerConfig: MATCHES_PER_CONFIG,
          maxTicks: MAX_TICKS,
          baseSeed: BASE_SEED,
          strategies: strategies.length,
          maxArmyGrid: MAX_ARMY_GRID,
          growthGrid: GROWTH_GRID,
          matchmaker: "info-gain",
        },
        configs,
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${OUTPUT_PATH}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
