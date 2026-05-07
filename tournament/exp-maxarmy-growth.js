#!/usr/bin/env node
// One-shot experiment: sweep (maxArmy, growth) on the lab1 map and run a
// rating tournament per config. Tests the hypothesis that move tech is
// overpowered because the default maxArmy=6 caps the value of stack tech.
//
// Each config gets its own runRatingTournament (so PL is fit only on its
// own matches). Matches are tagged with a config-specific rulesVersion
// (`v3-exp_a{maxArmy}_g{growth}`) so they're stored in matches.jsonl but
// stay out of the main v3 PL fit (rank.js's filterCurrentVersion only
// keeps `v3`).
//
// Output: tournament/exp-maxarmy-growth.json with per-config standings,
// plus a console table comparing rating shifts across configs.
//
// Run: node tournament/exp-maxarmy-growth.js

import { STRATEGY_LIST } from "../src/strategies/index.js";
import { MAPS } from "./maps.js";
import { runRatingTournament } from "./scheduler.js";
import { buildMatchEntry, appendMatches, getMatchLogPath } from "./matchLog.js";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(HERE, "exp-maxarmy-growth.json");

const BASE_MAP = MAPS.lab1;
const POOL_SIZE = 6;
const MATCHES_PER_CONFIG = 300;
const MAX_TICKS = 4000;
const BASE_SEED = 1;

const MAX_ARMY_GRID = [6, 12, 20];
const GROWTH_GRID = [1.0, 1.8];

function configTag(maxArmy, growth) {
  return `v3-exp_a${maxArmy}_g${growth.toFixed(1)}`;
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

async function runConfig(strategies, maxArmy, growth) {
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
      avgTerritory: +s.avgTerritory.toFixed(1),
      pointsPerGame: +s.pointsPerGame.toFixed(2),
    })),
  };
}

function printConfigHeader(cfg) {
  console.log(
    `\n=== maxArmy=${cfg.config.maxArmy}  growth=${cfg.config.growth.toFixed(1)}  ` +
      `(${cfg.matchCount} matches in ${(cfg.elapsedMs / 1000).toFixed(1)}s, tag=${cfg.tag}) ===`,
  );
  console.log(
    `${pad("#", 4)}  ${pad("Strategy", 22)}  ${pad("Rating", 7, true)}  ${pad("RD", 5, true)}  ` +
      `${pad("Plyd", 5, true)}  ${pad("Win%", 6, true)}  ${pad("AvgRank", 8, true)}`,
  );
  console.log("-".repeat(72));
}

function printTopN(standings, n) {
  for (let i = 0; i < Math.min(n, standings.length); i++) {
    const s = standings[i];
    console.log(
      `${pad(i + 1, 4)}  ${pad(s.name, 22)}  ${pad(s.rating, 7, true)}  ${pad(s.rd, 5, true)}  ` +
        `${pad(s.played, 5, true)}  ${pad(s.winRate.toFixed(1) + "%", 6, true)}  ${pad(s.avgRank.toFixed(2), 8, true)}`,
    );
  }
}

function rankMap(standings) {
  const m = new Map();
  standings.forEach((s, i) => m.set(s.name, { rank: i + 1, rating: s.rating }));
  return m;
}

function classifyMoveBucket(tech) {
  if (!tech) return "neutral";
  const move = tech.move ?? 20;
  if (move >= 40) return "high-move";
  if (move <= 10) return "low-move";
  return "mid-move";
}

function classifyStackBucket(tech) {
  if (!tech) return "neutral";
  const stack = tech.stack ?? 20;
  if (stack >= 40) return "high-stack";
  if (stack <= 10) return "low-stack";
  return "mid-stack";
}

function bucketAverages(standings, strategies) {
  const techByName = new Map();
  for (const s of strategies) techByName.set(s.name, s.tech ?? null);
  const buckets = new Map();
  for (const s of standings) {
    const tech = techByName.get(s.name);
    const moveBucket = classifyMoveBucket(tech);
    const stackBucket = classifyStackBucket(tech);
    const key = `${moveBucket} / ${stackBucket}`;
    if (!buckets.has(key)) buckets.set(key, { sum: 0, n: 0 });
    const b = buckets.get(key);
    b.sum += s.rating;
    b.n++;
  }
  return [...buckets.entries()]
    .map(([k, v]) => ({ key: k, count: v.n, avg: Math.round(v.sum / v.n) }))
    .sort((a, b) => b.avg - a.avg);
}

function deltaTable(configs, strategies) {
  // Compute rating shift for each bot from the first config (a=6, g=1.8)
  // baseline to the highest-maxArmy config at the same growth. Surfaces
  // which bots win/lose the most when stacks can grow larger.
  const baseline = configs.find(
    (c) => c.config.maxArmy === 6 && c.config.growth === 1.8,
  );
  const cap = configs.find(
    (c) => c.config.maxArmy === 20 && c.config.growth === 1.8,
  );
  if (!baseline || !cap) return null;
  const baseRanks = rankMap(baseline.standings);
  const capRanks = rankMap(cap.standings);
  const techByName = new Map();
  for (const s of strategies) techByName.set(s.name, s.tech ?? null);
  const rows = [];
  for (const [name, b] of baseRanks) {
    const c = capRanks.get(name);
    if (!c) continue;
    const tech = techByName.get(name);
    rows.push({
      name,
      tech,
      baselineRating: b.rating,
      capRating: c.rating,
      ratingDelta: c.rating - b.rating,
      baselineRank: b.rank,
      capRank: c.rank,
      rankDelta: b.rank - c.rank, // positive = improved
    });
  }
  return rows.sort((a, b) => b.ratingDelta - a.ratingDelta);
}

function fmtTech(t) {
  if (!t) return "neutral";
  const parts = [];
  for (const k of ["move", "stack", "prod", "atk", "def"]) {
    if (t[k] !== 20) parts.push(`${k}:${t[k]}`);
  }
  return parts.length ? parts.join(",") : "neutral";
}

async function main() {
  const strategies = STRATEGY_LIST;
  console.log(
    `Sweep: ${MAX_ARMY_GRID.length}×${GROWTH_GRID.length} configs, ` +
      `${MATCHES_PER_CONFIG} matches/config, K=${POOL_SIZE}, ${strategies.length} bots, base map=${BASE_MAP.name}.`,
  );
  console.log(`Match log: ${getMatchLogPath()} (each config tagged separately).`);

  const configs = [];
  for (const growth of GROWTH_GRID) {
    for (const maxArmy of MAX_ARMY_GRID) {
      console.log(
        `\n→ running maxArmy=${maxArmy} growth=${growth.toFixed(1)} ...`,
      );
      const cfg = await runConfig(strategies, maxArmy, growth);
      configs.push(cfg);
      printConfigHeader(cfg);
      printTopN(cfg.standings, 15);
    }
  }

  // Cross-config bucket averages
  console.log(`\n=== Average rating by tech bucket (move × stack) ===`);
  for (const cfg of configs) {
    console.log(
      `\nmaxArmy=${cfg.config.maxArmy} growth=${cfg.config.growth.toFixed(1)}:`,
    );
    const buckets = bucketAverages(cfg.standings, strategies);
    for (const b of buckets) {
      console.log(`  ${pad(b.key, 28)} avgRating=${pad(b.avg, 5, true)} (${b.count} bots)`);
    }
  }

  // Delta table: who wins/loses moving from a=6 to a=20 at g=1.8
  const deltas = deltaTable(configs, strategies);
  if (deltas) {
    console.log(`\n=== Rating shift: maxArmy 6 → 20 (growth 1.8) ===`);
    console.log(`Top 12 winners (raised most when stacks can grow):`);
    console.log(
      `${pad("Strategy", 22)}  ${pad("Tech", 28)}  ${pad("a6 R", 6, true)}  ${pad("a20 R", 6, true)}  ${pad("ΔR", 6, true)}  ${pad("ΔRank", 6, true)}`,
    );
    console.log("-".repeat(85));
    for (const row of deltas.slice(0, 12)) {
      const d = row.rankDelta >= 0 ? `+${row.rankDelta}` : String(row.rankDelta);
      console.log(
        `${pad(row.name, 22)}  ${pad(fmtTech(row.tech), 28)}  ${pad(row.baselineRating, 6, true)}  ${pad(row.capRating, 6, true)}  ${pad(row.ratingDelta >= 0 ? "+" + row.ratingDelta : row.ratingDelta, 6, true)}  ${pad(d, 6, true)}`,
      );
    }
    console.log(`\nTop 12 losers (dropped most when stacks can grow):`);
    console.log(
      `${pad("Strategy", 22)}  ${pad("Tech", 28)}  ${pad("a6 R", 6, true)}  ${pad("a20 R", 6, true)}  ${pad("ΔR", 6, true)}  ${pad("ΔRank", 6, true)}`,
    );
    console.log("-".repeat(85));
    for (const row of deltas.slice(-12).reverse()) {
      const d = row.rankDelta >= 0 ? `+${row.rankDelta}` : String(row.rankDelta);
      console.log(
        `${pad(row.name, 22)}  ${pad(fmtTech(row.tech), 28)}  ${pad(row.baselineRating, 6, true)}  ${pad(row.capRating, 6, true)}  ${pad(row.ratingDelta >= 0 ? "+" + row.ratingDelta : row.ratingDelta, 6, true)}  ${pad(d, 6, true)}`,
      );
    }
  }

  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        meta: {
          generatedAt: new Date().toISOString(),
          baseMap: BASE_MAP.name,
          baseDimensions: {
            width: BASE_MAP.config.width,
            height: BASE_MAP.config.height,
            wrap: BASE_MAP.config.wrap,
          },
          poolSize: POOL_SIZE,
          matchesPerConfig: MATCHES_PER_CONFIG,
          maxTicks: MAX_TICKS,
          baseSeed: BASE_SEED,
          strategies: strategies.length,
          maxArmyGrid: MAX_ARMY_GRID,
          growthGrid: GROWTH_GRID,
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
