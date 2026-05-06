#!/usr/bin/env node
// Map-space search driver. Two-pass culling:
//
//   Pass 1: cheap (small seed budget, no reliability split) across the full
//           grid; rank by a "cheap composite" (discrimination × midBand
//           with a tStable penalty). Keep the top --keep configs.
//   Pass 2: expensive (full evaluator) on the survivors; rank by composite.
//
// Usage:
//   node tournament/map-search/run.js                              # full search, default grid
//   node tournament/map-search/run.js --grid small                  # tiny smoke
//   node tournament/map-search/run.js --grid plant                  # only the planted bad configs
//   node tournament/map-search/run.js --bots top                    # use top 18 bots from arena league
//   node tournament/map-search/run.js --pass1-seeds 20 --keep 12 --pass2-seeds 80
//   node tournament/map-search/run.js --json --out search.json     # machine-readable output

import { readFileSync, writeFileSync } from "node:fs";
import { evaluateConfig, composite } from "./evaluator.js";
import { defaultGrid, smallGrid, planted } from "./configs.js";
import { STRATEGY_LIST, getStrategy, ALL_STRATEGY_LIST } from "../../src/strategies/index.js";

const HELP = `Usage: node tournament/map-search/run.js [options]

Search options:
  --grid NAME           default | small | plant | all (default: default)
  --bots LIST|balanced|top|all
                        Comma-separated bot names; or one of: "balanced"
                        (top 8 + middle 6 + bottom 6 of arena league;
                        guarantees anchor pairs are testable), "top"
                        (top 18 of arena league), "all" (every active
                        strategy). (default: balanced)
  --k N                 Override per-config k_players (default: use spec)
  --pass1-seeds N       Matches per config in pass 1 (default: 30)
  --pass2-seeds N       Matches per config in pass 2 (default: 120)
  --keep N              Configs advanced to pass 2 (default: 16)
  --max-ticks N         Per-match cap (default: 1500)
  --snapshot-every N    Snapshot interval for tStable (default: 25)
  --base-seed N         Seed for the seed RNG (default: 2026)
  --ground-truth NAME   Saved league map name to use as ground truth
                        (default: arena)

Output:
  --json                Emit JSON to stdout
  --out PATH            Write JSON to file (also prints summary)
  --quiet               Less progress output

Misc:
  --help, -h            Show this help
`;

function parseArgs(argv) {
  const opts = {
    grid: "default",
    bots: "balanced",
    k: null,
    pass1Seeds: 30,
    pass2Seeds: 120,
    keep: 16,
    maxTicks: 1500,
    snapshotEvery: 25,
    baseSeed: 2026,
    groundTruth: "arena",
    json: false,
    out: null,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--grid": opts.grid = next(); break;
      case "--bots": opts.bots = next(); break;
      case "--k": opts.k = parseInt(next(), 10); break;
      case "--pass1-seeds": opts.pass1Seeds = parseInt(next(), 10); break;
      case "--pass2-seeds": opts.pass2Seeds = parseInt(next(), 10); break;
      case "--keep": opts.keep = parseInt(next(), 10); break;
      case "--max-ticks": opts.maxTicks = parseInt(next(), 10); break;
      case "--snapshot-every": opts.snapshotEvery = parseInt(next(), 10); break;
      case "--base-seed": opts.baseSeed = parseInt(next(), 10); break;
      case "--ground-truth": opts.groundTruth = next(); break;
      case "--json": opts.json = true; break;
      case "--out": opts.out = next(); break;
      case "--quiet": opts.quiet = true; break;
      case "--help": case "-h": console.log(HELP); process.exit(0);
      default:
        console.error(`Unknown option: ${a}`);
        console.error(HELP);
        process.exit(1);
    }
  }
  return opts;
}

function loadGrid(name) {
  switch (name) {
    case "default": return defaultGrid();
    case "small":   return smallGrid();
    case "plant":   return planted();
    case "all":     return [...defaultGrid(), ...planted()];
    default:
      throw new Error(`Unknown grid: ${name}. Choose from: default, small, plant, all`);
  }
}

function loadGroundTruth(mapName) {
  const data = JSON.parse(readFileSync("tournament/leagues.json", "utf8"));
  const league = data.leagues.find((l) => l.map === mapName);
  if (!league) {
    throw new Error(`No saved league for map "${mapName}". Saved: ${data.leagues.map((l) => l.map).join(", ")}`);
  }
  const flat = league.tiers.flat();
  return Object.fromEntries(flat.map((n, i) => [n, i]));
}

function loadAnchors() {
  const a = JSON.parse(readFileSync("tournament/map-search/anchors.json", "utf8"));
  return a;
}

function resolveBots(spec) {
  if (spec === "all") return STRATEGY_LIST;
  if (spec === "top" || spec === "balanced") {
    const data = JSON.parse(readFileSync("tournament/leagues.json", "utf8"));
    const league = data.leagues.find((l) => l.map === "arena");
    const flat = league.tiers.flat();
    if (spec === "top") return flat.slice(0, 18).map(getStrategy);
    // balanced: top 8 + middle 6 + bottom 6 — guarantees the anchor
    // pairs (which include weak bots) have both members in the pool.
    const mid = Math.floor(flat.length / 2);
    const picks = [
      ...flat.slice(0, 8),
      ...flat.slice(mid - 3, mid + 3),
      ...flat.slice(-6),
    ];
    return [...new Set(picks)].map(getStrategy);
  }
  const names = spec.split(",").map((s) => s.trim()).filter(Boolean);
  return names.map(getStrategy);
}

// "Cheap composite" used in pass 1. No reliability term; just the
// info × tStable balance. Mirrors composite() in evaluator.js: negative
// average info is treated as zero (anti-correlated map is worthless).
function pass1Score(metrics) {
  const disc = metrics.discrimination ?? 0;
  const mid  = metrics.midBand ?? 0;
  const info = 0.5 * disc + 0.5 * mid;
  if (info <= 0) return 0;
  const tStab = metrics.medianTStable ?? 1;
  const timeoutPenalty = Math.max(0, 1 - 1.5 * (metrics.timeoutRate ?? 0));
  return info * (200 / Math.max(50, tStab)) * timeoutPenalty;
}

function fmt(n, d = 3) {
  if (n == null) return "    -";
  if (typeof n !== "number") return String(n);
  return n.toFixed(d);
}

function printRow(rank, c) {
  const m = c.metrics;
  console.log(
    `  ${String(rank).padStart(3)}. ${c.name.padEnd(34)} ` +
    `score=${fmt(c.score)} disc=${fmt(m.discrimination)} mid=${fmt(m.midBand)} ` +
    `rel=${fmt(m.reliability)} anc=${fmt(m.anchorAccuracy, 2)} ` +
    `tStab=${fmt(m.medianTStable, 0)} ticks=${fmt(m.medianTicks, 0)}/p95=${fmt(m.p95Ticks, 0)} ` +
    `to=${fmt(m.timeoutRate, 2)}`,
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const grid = loadGrid(opts.grid);
  const groundTruth = loadGroundTruth(opts.groundTruth);
  const anchors = loadAnchors();
  const bots = resolveBots(opts.bots);

  if (!opts.quiet) {
    console.log(`Map-search: grid=${opts.grid} (${grid.length} configs), bots=${bots.length}, ground-truth=${opts.groundTruth} (${Object.keys(groundTruth).length} ranked)`);
    console.log(`Pass 1: ${opts.pass1Seeds} seeds × ${grid.length} configs → keep ${opts.keep}`);
    console.log(`Pass 2: ${opts.pass2Seeds} seeds × ${opts.keep} configs (full reliability split-half)\n`);
  }

  // ---------- pass 1 ----------
  const pass1Start = Date.now();
  const pass1Results = [];
  for (let i = 0; i < grid.length; i++) {
    const cfg = grid[i];
    const k = Math.min(opts.k ?? cfg.spec.k ?? 4, bots.length);
    if (k > bots.length) {
      console.error(`Skipping ${cfg.name}: k=${k} > pool size ${bots.length}`);
      continue;
    }
    const out = evaluateConfig({
      config: cfg,
      bots,
      k,
      matchCount: opts.pass1Seeds,
      baseSeed: opts.baseSeed,
      maxTicks: opts.maxTicks,
      snapshotEvery: opts.snapshotEvery,
      groundTruth,
      anchorPairs: anchors.pairs,
      splitHalfReliability: false,
    });
    const score = pass1Score(out.metrics);
    pass1Results.push({ name: cfg.name, spec: cfg.spec, k, metrics: out.metrics, score });
    if (!opts.quiet) {
      const elapsed = ((Date.now() - pass1Start) / 1000).toFixed(0);
      const eta = (((Date.now() - pass1Start) / (i + 1)) * (grid.length - i - 1) / 1000).toFixed(0);
      process.stdout.write(`\r  pass1 ${i + 1}/${grid.length}  elapsed=${elapsed}s  eta=${eta}s   `);
    }
  }
  if (!opts.quiet) console.log();

  pass1Results.sort((a, b) => b.score - a.score);

  if (!opts.quiet) {
    console.log(`\nPass 1 complete (${((Date.now() - pass1Start) / 1000).toFixed(0)}s). Top 8:`);
    for (let i = 0; i < Math.min(8, pass1Results.length); i++) printRow(i + 1, pass1Results[i]);
    if (pass1Results.length > 8) {
      console.log(`  ... ${pass1Results.length - 8} more`);
      console.log(`\nBottom 3:`);
      for (let i = pass1Results.length - 3; i < pass1Results.length; i++) printRow(i + 1, pass1Results[i]);
    }
  }

  // ---------- pass 2 ----------
  const survivors = pass1Results.slice(0, Math.min(opts.keep, pass1Results.length));
  const pass2Start = Date.now();
  const pass2Results = [];
  for (let i = 0; i < survivors.length; i++) {
    const s = survivors[i];
    const cfg = grid.find((c) => c.name === s.name);
    const out = evaluateConfig({
      config: cfg,
      bots,
      k: s.k,
      matchCount: opts.pass2Seeds,
      baseSeed: opts.baseSeed + 5_000_000,
      maxTicks: opts.maxTicks,
      snapshotEvery: opts.snapshotEvery,
      groundTruth,
      anchorPairs: anchors.pairs,
      splitHalfReliability: true,
    });
    const score = composite(out.metrics);
    pass2Results.push({
      name: cfg.name, spec: cfg.spec, k: s.k,
      pass1Score: s.score, score, metrics: out.metrics,
      perBotScore: out.perBotScore,
    });
    if (!opts.quiet) {
      const elapsed = ((Date.now() - pass2Start) / 1000).toFixed(0);
      const eta = (((Date.now() - pass2Start) / (i + 1)) * (survivors.length - i - 1) / 1000).toFixed(0);
      process.stdout.write(`\r  pass2 ${i + 1}/${survivors.length}  elapsed=${elapsed}s  eta=${eta}s   `);
    }
  }
  if (!opts.quiet) console.log();

  pass2Results.sort((a, b) => b.score - a.score);

  // ---------- output ----------
  const summary = {
    opts,
    pass1Count: pass1Results.length,
    pass2Count: pass2Results.length,
    pass1Top: pass1Results.slice(0, 8).map(({ name, spec, k, metrics, score }) =>
      ({ name, spec, k, score, metrics })),
    pass2Sorted: pass2Results.map(({ name, spec, k, score, metrics, perBotScore }) =>
      ({ name, spec, k, score, metrics, perBotScore })),
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else {
    console.log(`\nPass 2 complete (${((Date.now() - pass2Start) / 1000).toFixed(0)}s). Final ranking:`);
    pass2Results.forEach((r, i) => printRow(i + 1, r));
  }

  if (opts.out) {
    writeFileSync(opts.out, JSON.stringify(summary, null, 2));
    if (!opts.quiet) console.log(`\nWrote ${opts.out}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
