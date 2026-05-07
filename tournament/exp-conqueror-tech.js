#!/usr/bin/env node
// Tech ablation: hold strategy = Conqueror, vary tech, run a 6-way FFA
// across the (maxArmy, growth) grid. Tests directly whether move tech
// dominates other distributions when the cap is low and whether that
// edge softens at higher maxArmy.
//
// Each config runs many seeds (with seat rotation) so PL has signal.
// Output: tournament/exp-conqueror-tech.json + console table.

import { default as Conqueror } from "../src/strategies/Conqueror.js";
import { MAPS } from "./maps.js";
import { runMatch } from "./arena.js";
import { techFromPartial } from "../src/core/Tech.js";
import { fitPlackettLuce } from "./plackettLuce.js";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(HERE, "exp-conqueror-tech.json");

const BASE_MAP = MAPS.lab1;
const MAX_TICKS = 4000;
const MATCHES_PER_CONFIG = 600;

const MAX_ARMY_GRID = [6, 12, 20];
const GROWTH_GRID = [1.0, 1.8];

// Tech variants. Names are cosmetic but stable across configs so PL
// fits a per-variant skill. All use Conqueror as the strategy.
const VARIANTS = [
  { name: "C-neutral",     tech: techFromPartial({}) },
  { name: "C-move50",      tech: techFromPartial({ move: 50 }) },
  { name: "C-move80",      tech: techFromPartial({ move: 80 }) },
  { name: "C-stack50",     tech: techFromPartial({ stack: 50 }) },
  { name: "C-stack80",     tech: techFromPartial({ stack: 80 }) },
  { name: "C-atk50stack50", tech: techFromPartial({ atk: 50, stack: 50 }) },
];

function pad(s, n, right = false) {
  s = String(s);
  return right ? s.padStart(n) : s.padEnd(n);
}

function makeMapConfig(maxArmy, growth) {
  return { ...BASE_MAP.config, maxArmy, growth };
}

// Rotate seat assignments deterministically by match index so each
// variant occupies each seat with similar frequency. K=6 variants in
// 6 seats: shifting by m mod 6 cycles through all rotations. Combined
// with K seeds, every variant has roughly equal exposure to each seat
// and adversary positioning.
function rotatedLineup(variants, m) {
  const k = variants.length;
  return Array.from({ length: k }, (_, i) => variants[(i + m) % k]);
}

function runConfig(maxArmy, growth) {
  const mapConfig = makeMapConfig(maxArmy, growth);
  const positions = BASE_MAP.positions(VARIANTS.length);
  const t0 = Date.now();

  const stats = new Map();
  for (const v of VARIANTS) {
    stats.set(v.name, { name: v.name, played: 0, wins: 0, sumPlace: 0, sumTerritory: 0 });
  }
  const orderings = []; // for PL fit

  for (let m = 0; m < MATCHES_PER_CONFIG; m++) {
    const rotated = rotatedLineup(VARIANTS, m);
    // Build entries: each variant uses Conqueror strategy with its tech;
    // the entry's `name` is what shows up in result.ranking[].entryName,
    // but PL's ordering uses result.ranking[].strategy which is the
    // strategy.name. We need per-variant identity for PL — overload
    // result.ranking by passing entry name and rebuilding orderings
    // from entryName instead.
    const entries = rotated.map((v) => ({
      strategy: Conqueror,
      tech: v.tech,
      name: v.name,
    }));
    const result = runMatch({
      strategies: entries,
      mapConfig,
      startPositions: positions,
      seed: 1 + m,
      maxTicks: MAX_TICKS,
    });
    // Build PL ordering by entryName (each variant is a distinct "player")
    orderings.push(result.ranking.map((r) => r.entryName));
    for (let place = 0; place < result.ranking.length; place++) {
      const r = result.ranking[place];
      const s = stats.get(r.entryName);
      s.played++;
      s.sumPlace += place;
      s.sumTerritory += r.territory;
      if (place === 0 && r.survived) s.wins++;
    }
  }

  const { skill, iterations, converged } = fitPlackettLuce(orderings);
  const standings = VARIANTS.map((v) => {
    const s = stats.get(v.name);
    const sk = skill[v.name] ?? 1;
    const rating = Math.round(1000 + 400 * Math.log10(sk));
    return {
      name: v.name,
      tech: v.tech,
      rating,
      played: s.played,
      wins: s.wins,
      winRate: +(s.wins / s.played * 100).toFixed(1),
      avgRank: +(s.sumPlace / s.played + 1).toFixed(2),
      avgTerritory: +(s.sumTerritory / s.played).toFixed(1),
    };
  }).sort((a, b) => b.rating - a.rating);

  return {
    config: { maxArmy, growth },
    elapsedMs: Date.now() - t0,
    matchCount: MATCHES_PER_CONFIG,
    plIterations: iterations,
    plConverged: converged,
    standings,
  };
}

function fmtTech(t) {
  const parts = [];
  for (const k of ["move", "stack", "prod", "atk", "def"]) {
    if (t[k] !== 20) parts.push(`${k}:${t[k]}`);
  }
  return parts.length ? parts.join(",") : "neutral";
}

function printConfig(cfg) {
  console.log(
    `\n=== Conqueror tech ablation · maxArmy=${cfg.config.maxArmy}  growth=${cfg.config.growth.toFixed(1)} ` +
      `(${cfg.matchCount} matches, ${(cfg.elapsedMs / 1000).toFixed(1)}s) ===`,
  );
  console.log(
    `${pad("#", 4)}  ${pad("Variant", 16)}  ${pad("Tech", 24)}  ${pad("Rating", 7, true)}  ${pad("Win%", 6, true)}  ${pad("AvgRank", 8, true)}  ${pad("AvgTerr", 8, true)}`,
  );
  console.log("-".repeat(86));
  cfg.standings.forEach((s, i) => {
    console.log(
      `${pad(i + 1, 4)}  ${pad(s.name, 16)}  ${pad(fmtTech(s.tech), 24)}  ${pad(s.rating, 7, true)}  ${pad(s.winRate.toFixed(1) + "%", 6, true)}  ${pad(s.avgRank.toFixed(2), 8, true)}  ${pad(s.avgTerritory.toFixed(1), 8, true)}`,
    );
  });
}

function ratingShiftTable(configs) {
  // Build matrix: variant × config → rating
  const variantNames = VARIANTS.map((v) => v.name);
  const tags = configs.map((c) => `a${c.config.maxArmy}g${c.config.growth.toFixed(1)}`);
  const grid = new Map();
  for (const v of variantNames) grid.set(v, {});
  for (const cfg of configs) {
    const tag = `a${cfg.config.maxArmy}g${cfg.config.growth.toFixed(1)}`;
    for (const s of cfg.standings) grid.get(s.name)[tag] = s.rating;
  }
  console.log(`\n=== Rating matrix (rows = variant, cols = config) ===`);
  console.log(
    `${pad("Variant", 16)}  ${tags.map((t) => pad(t, 9, true)).join("  ")}`,
  );
  console.log("-".repeat(16 + tags.length * 11));
  for (const v of variantNames) {
    const cells = tags.map((t) => pad(grid.get(v)[t] ?? "-", 9, true)).join("  ");
    console.log(`${pad(v, 16)}  ${cells}`);
  }
}

async function main() {
  console.log(
    `Conqueror tech ablation: ${VARIANTS.length} variants × ` +
      `${MAX_ARMY_GRID.length}×${GROWTH_GRID.length} configs, ` +
      `${MATCHES_PER_CONFIG} matches/config, base map=${BASE_MAP.name}.`,
  );
  for (const v of VARIANTS) {
    console.log(`  ${pad(v.name, 16)} ${fmtTech(v.tech)}`);
  }

  const configs = [];
  for (const growth of GROWTH_GRID) {
    for (const maxArmy of MAX_ARMY_GRID) {
      console.log(
        `\n→ running maxArmy=${maxArmy} growth=${growth.toFixed(1)} ...`,
      );
      const cfg = runConfig(maxArmy, growth);
      configs.push(cfg);
      printConfig(cfg);
    }
  }

  ratingShiftTable(configs);

  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        meta: {
          generatedAt: new Date().toISOString(),
          baseMap: BASE_MAP.name,
          maxTicks: MAX_TICKS,
          matchesPerConfig: MATCHES_PER_CONFIG,
          variants: VARIANTS.map((v) => ({ name: v.name, tech: v.tech })),
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
