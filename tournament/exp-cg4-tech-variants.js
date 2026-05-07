#!/usr/bin/env node
// Tech-space exploration on the current top-rated bot.
//
// Holds strategy = Conqueror_g4_1f6790 (the rating leader in
// tournament/rankings.json: 1249), varies tech across 50 deterministic
// loadouts spanning the (move, stack, prod, atk, def) simplex. Plays
// several rating seasons confined to those 50 variants so we can read
// off whether anything beats the GA-discovered 90/0/2/4/4 build for
// this strategy.
//
// Why this is a fair test of tech alone: every variant shares the same
// `act`, so any rating gap is attributable to the loadout, not to
// behavioral differences. Pool-play matches plus a Plackett-Luce fit
// give global ratings within the 50-bot pool. A final round-robin on
// lab3 confirms head-to-head ordering among the top 10.
//
// Output: tournament/exp-cg4-tech-variants.json + console table per season.

import Cg4 from "../src/strategies/Conqueror_g4_1f6790.js";
import { MAPS } from "./maps.js";
import { runRatingTournament, runFfaTournament } from "./scheduler.js";
import { mulberry32 } from "../src/core/rng.js";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_PATH = resolve(HERE, "exp-cg4-tech-variants.json");

const MAP = MAPS.lab1;
const RR_MAP = MAPS.lab3;
const POOL_SIZE = 6;
const MAX_TICKS = 4000;
const VARIANT_COUNT = 50;

// CLI: --seasons N --matches M --rr-rounds N --rr-top N --out PATH --no-rr
function parseArgs(argv) {
  const opts = {
    seasons: 3,
    matchesPerSeason: 400,
    rrRounds: 21,
    rrTop: 10,
    runRr: true,
    output: DEFAULT_OUTPUT_PATH,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--seasons": opts.seasons = parseInt(next(), 10); break;
      case "--matches": opts.matchesPerSeason = parseInt(next(), 10); break;
      case "--rr-rounds": opts.rrRounds = parseInt(next(), 10); break;
      case "--rr-top": opts.rrTop = parseInt(next(), 10); break;
      case "--no-rr": opts.runRr = false; break;
      case "--out": opts.output = next(); break;
      case "--help": case "-h":
        console.log(
          "Usage: node tournament/exp-cg4-tech-variants.js " +
            "[--seasons N] [--matches M] [--rr-rounds N] [--rr-top N] " +
            "[--no-rr] [--out PATH]",
        );
        process.exit(0);
      default:
        console.error(`Unknown option: ${a}`);
        process.exit(1);
    }
  }
  return opts;
}

const KNOBS = ["move", "stack", "prod", "atk", "def"];
const KNOB_INITIAL = { move: "M", stack: "S", prod: "P", atk: "A", def: "D" };

function tech(move, stack, prod, atk, def) {
  return { move, stack, prod, atk, def };
}

function techKey(t) {
  return KNOBS.map((k) => t[k]).join("/");
}

function fmtTech(t) {
  return KNOBS.map((k) => `${KNOB_INITIAL[k]}${String(t[k]).padStart(2, " ")}`).join(" ");
}

// Build 50 distinct, deterministic tech vectors covering the simplex:
//   anchors, pure-knob, 50/50 pairs, 80/20 dominant-second, then random.
// Random fills are seeded so the experiment is reproducible.
function buildVariants() {
  const variants = [];
  const seen = new Set();
  const add = (t, tag) => {
    const sum = KNOBS.reduce((s, k) => s + t[k], 0);
    if (sum !== 100) throw new Error(`tech sum ${sum} ≠ 100: ${JSON.stringify(t)}`);
    const key = techKey(t);
    if (seen.has(key)) return false;
    seen.add(key);
    const idx = variants.length + 1;
    variants.push({
      name: `Cg4_${String(idx).padStart(2, "0")}_${tag}`,
      tech: { ...t },
    });
    return variants.length < VARIANT_COUNT;
  };

  // Anchors: GA optimum + neutral peanut-butter.
  add(Cg4.tech, "orig");
  add(tech(20, 20, 20, 20, 20), "neutral");

  // 5 pure-knob extremes.
  for (let i = 0; i < 5; i++) {
    const v = [0, 0, 0, 0, 0];
    v[i] = 100;
    add(tech(...v), `pure${KNOB_INITIAL[KNOBS[i]]}`);
  }

  // All 10 50/50 two-knob splits.
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      const v = [0, 0, 0, 0, 0];
      v[i] = 50;
      v[j] = 50;
      add(tech(...v), `${KNOB_INITIAL[KNOBS[i]]}${KNOB_INITIAL[KNOBS[j]]}50`);
    }
  }

  // 80/20 dominant-second-knob pairs, until we've used the budget for
  // structured variants. With 50 total and 17 added so far, we take 15
  // of the 20 ordered (i,j) pairs.
  const STRUCTURED_BUDGET = 32;
  for (let i = 0; i < 5 && variants.length < STRUCTURED_BUDGET; i++) {
    for (let j = 0; j < 5 && variants.length < STRUCTURED_BUDGET; j++) {
      if (i === j) continue;
      const v = [0, 0, 0, 0, 0];
      v[i] = 80;
      v[j] = 20;
      add(tech(...v), `${KNOB_INITIAL[KNOBS[i]]}80${KNOB_INITIAL[KNOBS[j]]}20`);
    }
  }

  // Random Dirichlet-style splits to fill to 50, deterministic seed.
  const rng = mulberry32(0x1f6790);
  let guard = 1000;
  while (variants.length < VARIANT_COUNT && guard-- > 0) {
    const raw = [rng(), rng(), rng(), rng(), rng()];
    const sum = raw.reduce((a, b) => a + b, 0);
    const norm = raw.map((r) => r / sum);
    const ints = norm.map((n) => Math.floor(n * 100));
    let leftover = 100 - ints.reduce((a, b) => a + b, 0);
    const fracs = norm
      .map((n, i) => ({ i, r: n * 100 - ints[i] }))
      .sort((a, b) => b.r - a.r);
    for (let k = 0; k < leftover; k++) ints[fracs[k].i]++;
    add(tech(...ints), `r${variants.length + 1}`);
  }

  if (variants.length !== VARIANT_COUNT) {
    throw new Error(`expected ${VARIANT_COUNT} variants, got ${variants.length}`);
  }
  return variants;
}

function asStrategy(variant) {
  return {
    name: variant.name,
    author: "claude",
    description: `Conqueror_g4_1f6790 act + tech ${techKey(variant.tech)}`,
    act: Cg4.act,
    tech: { ...variant.tech },
  };
}

function pad(s, n, right = false) {
  s = String(s);
  return right ? s.padStart(n) : s.padEnd(n);
}

function printStandings(rows, variants, header) {
  console.log(header);
  console.log(
    `${pad("#", 4)}  ${pad("Variant", 22)}  ${pad("Tech", 24)}  ` +
      `${pad("Rating", 7, true)}  ${pad("Plyd", 5, true)}  ` +
      `${pad("Win%", 6, true)}  ${pad("AvgRank", 8, true)}`,
  );
  console.log("-".repeat(85));
  rows.forEach((row, i) => {
    const variant = variants.find((v) => v.name === row.name);
    const ratingCell = row.rating != null ? row.rating.toFixed(0) : row.pointsPerGame?.toFixed(2) ?? "-";
    console.log(
      `${pad(i + 1, 4)}  ${pad(row.name, 22)}  ${pad(fmtTech(variant.tech), 24)}  ` +
        `${pad(ratingCell, 7, true)}  ${pad(row.played, 5, true)}  ` +
        `${pad((row.winRate * 100).toFixed(1) + "%", 6, true)}  ${pad(row.avgRank.toFixed(2), 8, true)}`,
    );
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const variants = buildVariants();
  console.log(
    `Tech-space exploration: ${variants.length} variants of Conqueror_g4_1f6790 ` +
      `(parent rating 1249, parent tech ${techKey(Cg4.tech)}).`,
  );
  const rrLabel = opts.runRr
    ? `final RR top ${opts.rrTop} on ${RR_MAP.name} (${opts.rrRounds} rounds)`
    : `no round-robin`;
  console.log(
    `Map=${MAP.name} · poolSize=${POOL_SIZE} · seasons=${opts.seasons} × ` +
      `${opts.matchesPerSeason} matches · ${rrLabel}.`,
  );
  console.log(`\nVariants:`);
  for (const v of variants) {
    console.log(`  ${pad(v.name, 22)}  ${fmtTech(v.tech)}`);
  }

  const strategies = variants.map(asStrategy);
  const seasons = [];
  let priors = null;

  for (let s = 0; s < opts.seasons; s++) {
    const t0 = Date.now();
    const result = runRatingTournament({
      strategies,
      map: MAP,
      poolSize: POOL_SIZE,
      matches: opts.matchesPerSeason,
      baseSeed: 1 + s * 1_000_003,
      maxTicks: MAX_TICKS,
      priors,
    });
    const dtMs = Date.now() - t0;
    const totalPlayed = result.standings.reduce((m, x) => m + x.played, 0);
    const avgPlayed = totalPlayed / result.standings.length;
    printStandings(
      result.standings,
      variants,
      `\n=== Season ${s + 1}/${opts.seasons} · ${opts.matchesPerSeason} matches · ` +
        `${(dtMs / 1000).toFixed(1)}s · avg ${avgPlayed.toFixed(1)} games/variant ===`,
    );

    seasons.push({
      season: s + 1,
      elapsedMs: dtMs,
      matches: opts.matchesPerSeason,
      baseSeed: 1 + s * 1_000_003,
      standings: result.standings.map((row) => ({
        name: row.name,
        rating: row.rating,
        rd: row.rd,
        played: row.played,
        wins: row.wins,
        winRate: +(row.winRate * 100).toFixed(1),
        avgRank: +row.avgRank.toFixed(2),
        avgTerritory: +row.avgTerritory.toFixed(1),
        pointsPerGame: +row.pointsPerGame.toFixed(3),
      })),
    });

    // Carry rating + match counts forward so the next season's
    // info-gain matchmaker can target the still-uncertain variants.
    priors = {};
    for (const row of result.standings) {
      priors[row.name] = { rating: row.rating, played: row.played };
    }
  }

  // Optional FFA round-robin among the top rrTop after the last season.
  let rrPayload = null;
  if (opts.runRr) {
    const topNames = seasons[seasons.length - 1].standings
      .slice(0, opts.rrTop)
      .map((r) => r.name);
    const topStrategies = topNames.map((n) => strategies.find((s) => s.name === n));
    const tRR = Date.now();
    const rr = runFfaTournament({
      strategies: topStrategies,
      map: RR_MAP,
      rounds: opts.rrRounds,
      baseSeed: 0xC0FFEE,
      maxTicks: MAX_TICKS,
    });
    const rrMs = Date.now() - tRR;
    console.log(
      `\n=== Final round-robin · top ${opts.rrTop} · ${opts.rrRounds} rounds · ` +
        `map=${RR_MAP.name} · ${(rrMs / 1000).toFixed(1)}s ===`,
    );
    console.log(
      `${pad("#", 4)}  ${pad("Variant", 22)}  ${pad("Tech", 24)}  ` +
        `${pad("PPG", 6, true)}  ${pad("Wins", 5, true)}  ` +
        `${pad("Win%", 6, true)}  ${pad("AvgRank", 8, true)}`,
    );
    console.log("-".repeat(85));
    rr.standings.forEach((row, i) => {
      const variant = variants.find((v) => v.name === row.name);
      console.log(
        `${pad(i + 1, 4)}  ${pad(row.name, 22)}  ${pad(fmtTech(variant.tech), 24)}  ` +
          `${pad(row.pointsPerGame.toFixed(2), 6, true)}  ${pad(row.wins, 5, true)}  ` +
          `${pad((row.winRate * 100).toFixed(1) + "%", 6, true)}  ${pad(row.avgRank.toFixed(2), 8, true)}`,
      );
    });
    rrPayload = rr.standings.map((row) => ({
      name: row.name,
      played: row.played,
      wins: row.wins,
      pointsPerGame: +row.pointsPerGame.toFixed(3),
      winRate: +(row.winRate * 100).toFixed(1),
      avgRank: +row.avgRank.toFixed(3),
      avgTerritory: +row.avgTerritory.toFixed(1),
    }));
  }

  await writeFile(
    opts.output,
    JSON.stringify(
      {
        meta: {
          generatedAt: new Date().toISOString(),
          parent: "Conqueror_g4_1f6790",
          parentTech: Cg4.tech,
          map: MAP.name,
          rrMap: opts.runRr ? RR_MAP.name : null,
          maxTicks: MAX_TICKS,
          poolSize: POOL_SIZE,
          seasonsRun: opts.seasons,
          matchesPerSeason: opts.matchesPerSeason,
          rrRounds: opts.runRr ? opts.rrRounds : null,
          rrTop: opts.runRr ? opts.rrTop : null,
          variantCount: variants.length,
        },
        variants: variants.map((v) => ({ name: v.name, tech: v.tech })),
        seasons,
        roundRobin: rrPayload,
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${opts.output}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
