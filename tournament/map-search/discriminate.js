#!/usr/bin/env node
// Cross-map discrimination experiment.
//
// Question: among map configs varying on (size, growth, maxArmy, k), which
// single map best predicts the cross-map consensus ranking? I.e. which map
// "sorts winners on maps in general" most efficiently?
//
// Method:
//   1. Build a grid varying size × growth × maxArmy × k (line/wrap fixed
//      based on prior search findings).
//   2. Run M matches per config with the same balanced bot pool. Per-bot
//      score = Borda points-per-game.
//   3. Build a consensus ranking = mean rank across all configs. For each
//      config, compute LEAVE-ONE-OUT consensus (mean rank across all
//      OTHER configs) and score the config by Spearman vs that LOO target.
//   4. Composite = max(LOO Spearman, 0) × split-half reliability × 200/tStable.
//   5. Report: top configs, per-axis marginals, and the "general-purpose"
//      winner per axis combination.
//
// Usage:
//   node tournament/map-search/discriminate.js
//   node tournament/map-search/discriminate.js --matches 80 --pool balanced
//   node tournament/map-search/discriminate.js --grid small --out disc.json

import { readFileSync, writeFileSync } from "node:fs";
import { runMatch } from "../arena.js";
import { mulberry32 } from "../../src/core/rng.js";
import { getStrategy } from "../../src/strategies/index.js";
import { topologyFns } from "./configs.js";
import {
  scoresToRanks,
  spearmanByName,
  tStable,
} from "./metrics.js";

const HELP = `Usage: node tournament/map-search/discriminate.js [options]

Grid (line topology + wrap=true held fixed):
  --sizes LIST          comma list of WxH (default: 24x18,30x22,38x28,50x36)
  --growths LIST        (default: 0.8,1.2,1.8,2.2)
  --max-armys LIST      (default: 4,6,12)
  --ks LIST             (default: 3,4,5,6)
  --grid small          shortcut for a tiny smoke grid
  --grid full           full grid (default)

Pool / matches:
  --pool balanced|top   bot pool from arena league (default: balanced; 24 bots)
  --matches N           matches per config (default: 60)
  --max-ticks N         per-match cap (default: 1500)
  --snapshot-every N    for tStable (default: 25)
  --base-seed N         (default: 7777)
  --reliability         compute split-half reliability (slower; default on)
  --no-reliability      skip split-half pass

Output:
  --out PATH            write JSON summary
  --top N               print top-N configs (default: 15)
  --quiet               suppress progress

  --help, -h            this help
`;

function parseArgs(argv) {
  const o = {
    sizes: [[24,18],[30,22],[38,28],[50,36]],
    growths: [0.8, 1.2, 1.8, 2.2],
    maxArmys: [4, 6, 12],
    ks: [3, 4, 5, 6],
    pool: "balanced",
    matches: 60,
    maxTicks: 1500,
    snapshotEvery: 25,
    baseSeed: 7777,
    reliability: true,
    out: null,
    top: 15,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--sizes":      o.sizes = next().split(",").map(s => s.split("x").map(Number)); break;
      case "--growths":    o.growths = next().split(",").map(Number); break;
      case "--max-armys":  o.maxArmys = next().split(",").map(Number); break;
      case "--ks":         o.ks = next().split(",").map(Number); break;
      case "--grid":
        if (next() === "small") {
          o.sizes = [[24,18],[30,22]];
          o.growths = [1.2, 1.8];
          o.maxArmys = [6, 12];
          o.ks = [3, 4];
        }
        break;
      case "--pool":         o.pool = next(); break;
      case "--matches":      o.matches = parseInt(next(), 10); break;
      case "--max-ticks":    o.maxTicks = parseInt(next(), 10); break;
      case "--snapshot-every": o.snapshotEvery = parseInt(next(), 10); break;
      case "--base-seed":    o.baseSeed = parseInt(next(), 10); break;
      case "--reliability":  o.reliability = true; break;
      case "--no-reliability": o.reliability = false; break;
      case "--out":          o.out = next(); break;
      case "--top":          o.top = parseInt(next(), 10); break;
      case "--quiet":        o.quiet = true; break;
      case "--help": case "-h": console.log(HELP); process.exit(0);
      default:
        console.error(`Unknown option: ${a}`);
        console.error(HELP);
        process.exit(1);
    }
  }
  return o;
}

function resolveBots(spec) {
  const data = JSON.parse(readFileSync("tournament/leagues.json", "utf8"));
  const league = data.leagues.find(l => l.map === "arena");
  if (!league) throw new Error("No saved arena league for bot selection");
  const flat = league.tiers.flat();
  let names;
  if (spec === "top") {
    names = flat.slice(0, 24);
  } else if (spec === "balanced") {
    // 8 top, 8 middle, 8 bottom — wide ability range so cross-map consensus
    // captures more than just a single tier's intra-noise.
    const mid = Math.floor(flat.length / 2);
    names = [
      ...flat.slice(0, 8),
      ...flat.slice(mid - 4, mid + 4),
      ...flat.slice(-8),
    ];
  } else {
    names = spec.split(",").map(s => s.trim()).filter(Boolean);
  }
  // Dedup, drop unknowns silently.
  const seen = new Set();
  const out = [];
  for (const n of names) {
    if (seen.has(n)) continue;
    seen.add(n);
    try { out.push(getStrategy(n)); } catch (_) { /* skip */ }
  }
  return out;
}

function makeConfig(spec) {
  const { width, height, growth, maxArmy, wrap, topology, k } = spec;
  const name = [
    `${width}x${height}`,
    `g${String(growth).replace(".","p")}`,
    `m${maxArmy}`,
    wrap ? "wrap" : "nowrap",
    topology,
    `k${k}`,
  ].join("_");
  return {
    name,
    spec: { ...spec },
    config: { width, height, growth, maxArmy, wrap },
    positions: (n) => topologyFns[topology](n, { width, height }),
  };
}

function buildGrid(o) {
  const out = [];
  for (const [w, h] of o.sizes) {
    for (const g of o.growths) {
      for (const m of o.maxArmys) {
        for (const k of o.ks) {
          out.push(makeConfig({
            width: w, height: h, growth: g, maxArmy: m,
            wrap: true, topology: "line", k,
          }));
        }
      }
    }
  }
  return out;
}

function sampleWithoutReplacement(arr, k, rng) {
  const pool = arr.slice();
  const out = [];
  for (let i = 0; i < k; i++) {
    const j = Math.floor(rng() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}

// One pool-play pass: M matches of K bots each. Returns Borda score per bot
// and per-match metadata for tStable / cost stats.
function runPass({ config, bots, k, matchCount, baseSeed, maxTicks, snapshotEvery }) {
  const sampleRng = mulberry32(baseSeed ^ 0xdeadbeef);
  const pts = new Map(bots.map(b => [b.name, { played: 0, points: 0 }]));
  const meta = [];
  for (let m = 0; m < matchCount; m++) {
    const lineup = sampleWithoutReplacement(bots, k, sampleRng);
    const r = runMatch({
      strategies: lineup,
      mapConfig: config.config,
      startPositions: config.positions(k),
      seed: baseSeed + m,
      maxTicks,
      snapshotEvery,
    });
    const slots = r.ranking.length;
    for (let i = 0; i < slots; i++) {
      const rec = pts.get(r.ranking[i].strategy);
      if (!rec) continue;
      rec.played++;
      rec.points += slots - 1 - i;
    }
    let tStab = r.ticks;
    if (snapshotEvery > 0 && r.snapshots) {
      const finalSlots = r.ranking.map(x => x.slot);
      tStab = tStable(r.snapshots, finalSlots, r.ticks, 0.9);
    }
    meta.push({ ticks: r.ticks, tStable: tStab, timedOut: r.endReason === "max-ticks" });
  }
  const perBot = {};
  for (const [n, rec] of pts) perBot[n] = rec.played > 0 ? rec.points / rec.played : 0;
  return { perBot, meta };
}

function quantile(sortedNums, q) {
  if (sortedNums.length === 0) return null;
  const idx = Math.min(sortedNums.length - 1, Math.floor(q * (sortedNums.length - 1)));
  return sortedNums[idx];
}

function fmt(n, d = 3) {
  if (n == null) return "    -";
  if (typeof n !== "number") return String(n);
  return n.toFixed(d);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const grid = buildGrid(opts);
  const bots = resolveBots(opts.pool);
  const botNames = bots.map(b => b.name);

  if (!opts.quiet) {
    console.log(`Cross-map discrimination`);
    console.log(`  grid:    ${grid.length} configs`);
    console.log(`  pool:    ${bots.length} bots (${opts.pool})`);
    console.log(`  matches: ${opts.matches} per config`);
    console.log(`  axes:    sizes=${opts.sizes.map(([w,h])=>`${w}x${h}`).join(",")}`);
    console.log(`           growths=${opts.growths.join(",")}`);
    console.log(`           maxArmys=${opts.maxArmys.join(",")}`);
    console.log(`           ks=${opts.ks.join(",")}`);
    console.log();
  }

  // ---------- main pass: per-config ranking ----------
  const start = Date.now();
  const perConfig = [];
  for (let i = 0; i < grid.length; i++) {
    const cfg = grid[i];
    const k = cfg.spec.k;
    if (k > bots.length) {
      console.error(`  skip ${cfg.name}: k=${k} > pool=${bots.length}`);
      continue;
    }
    const { perBot, meta } = runPass({
      config: cfg, bots, k,
      matchCount: opts.matches,
      baseSeed: opts.baseSeed,
      maxTicks: opts.maxTicks,
      snapshotEvery: opts.snapshotEvery,
    });
    const ranks = scoresToRanks(perBot);
    const tStabs = meta.map(m => m.tStable).sort((a,b) => a - b);
    const ticks  = meta.map(m => m.ticks).sort((a,b) => a - b);
    const timeouts = meta.filter(m => m.timedOut).length;
    perConfig.push({
      name: cfg.name,
      spec: cfg.spec,
      k,
      perBot,
      ranks,
      medianTStable: quantile(tStabs, 0.5),
      p95TStable: quantile(tStabs, 0.95),
      medianTicks: quantile(ticks, 0.5),
      timeoutRate: meta.length > 0 ? timeouts / meta.length : 0,
    });
    if (!opts.quiet) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      const eta = (((Date.now() - start) / (i + 1)) * (grid.length - i - 1) / 1000).toFixed(0);
      process.stdout.write(`\r  main ${i + 1}/${grid.length}  elapsed=${elapsed}s eta=${eta}s   `);
    }
  }
  if (!opts.quiet) console.log();

  // ---------- consensus: mean rank across configs ----------
  // For each bot, average its rank across all configs (treating absent as
  // mid-pool though every bot should appear in every config given the
  // balanced pool). Then compute the leave-one-out consensus per config.
  const meanRank = {};
  for (const name of botNames) {
    let sum = 0, count = 0;
    for (const c of perConfig) {
      if (name in c.ranks) { sum += c.ranks[name]; count++; }
    }
    meanRank[name] = count > 0 ? sum / count : null;
  }

  function looConsensus(excludeIdx) {
    const out = {};
    for (const name of botNames) {
      let sum = 0, count = 0;
      for (let i = 0; i < perConfig.length; i++) {
        if (i === excludeIdx) continue;
        if (name in perConfig[i].ranks) {
          sum += perConfig[i].ranks[name];
          count++;
        }
      }
      out[name] = count > 0 ? sum / count : null;
    }
    return out;
  }

  // ---------- discrimination per config ----------
  for (let i = 0; i < perConfig.length; i++) {
    const c = perConfig[i];
    const loo = looConsensus(i);
    c.discLOO = spearmanByName(c.ranks, loo);
    c.discAll = spearmanByName(c.ranks, meanRank);
  }

  // ---------- split-half reliability ----------
  if (opts.reliability) {
    const relStart = Date.now();
    for (let i = 0; i < perConfig.length; i++) {
      const c = perConfig[i];
      const cfg = grid.find(g => g.name === c.name);
      const half = Math.floor(opts.matches / 2);
      const A = runPass({
        config: cfg, bots, k: c.k,
        matchCount: half,
        baseSeed: opts.baseSeed + 1_000_001,
        maxTicks: opts.maxTicks,
        snapshotEvery: 0,
      });
      const B = runPass({
        config: cfg, bots, k: c.k,
        matchCount: half,
        baseSeed: opts.baseSeed + 2_000_003,
        maxTicks: opts.maxTicks,
        snapshotEvery: 0,
      });
      c.reliability = spearmanByName(scoresToRanks(A.perBot), scoresToRanks(B.perBot));
      if (!opts.quiet) {
        const elapsed = ((Date.now() - relStart) / 1000).toFixed(0);
        const eta = (((Date.now() - relStart) / (i + 1)) * (perConfig.length - i - 1) / 1000).toFixed(0);
        process.stdout.write(`\r  rel  ${i + 1}/${perConfig.length}  elapsed=${elapsed}s eta=${eta}s   `);
      }
    }
    if (!opts.quiet) console.log();
  }

  // ---------- composite ----------
  for (const c of perConfig) {
    const disc = c.discLOO ?? 0;
    const rel  = c.reliability ?? 1;
    const tStab = c.medianTStable ?? 1;
    const timeoutPenalty = Math.max(0, 1 - 1.5 * (c.timeoutRate ?? 0));
    if (disc <= 0) { c.composite = 0; continue; }
    c.composite = disc * Math.max(0, rel) * (200 / Math.max(50, tStab)) * timeoutPenalty;
  }

  // ---------- per-axis marginals ----------
  function groupBy(keyFn) {
    const buckets = new Map();
    for (const c of perConfig) {
      const k = keyFn(c);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(c);
    }
    const out = [];
    for (const [k, arr] of buckets) {
      const meanDisc = arr.reduce((s,c) => s + (c.discLOO ?? 0), 0) / arr.length;
      const meanRel  = arr.reduce((s,c) => s + (c.reliability ?? 0), 0) / arr.length;
      const meanT    = arr.reduce((s,c) => s + (c.medianTStable ?? 0), 0) / arr.length;
      const meanComp = arr.reduce((s,c) => s + (c.composite ?? 0), 0) / arr.length;
      out.push({ key: k, n: arr.length, meanDisc, meanRel, meanT, meanComp });
    }
    out.sort((a,b) => b.meanComp - a.meanComp);
    return out;
  }

  const bySize    = groupBy(c => `${c.spec.width}x${c.spec.height}`);
  const byGrowth  = groupBy(c => `g=${c.spec.growth}`);
  const byMaxArmy = groupBy(c => `m=${c.spec.maxArmy}`);
  const byK       = groupBy(c => `k=${c.spec.k}`);

  // ---------- print results ----------
  const sorted = perConfig.slice().sort((a, b) => b.composite - a.composite);

  console.log(`\nTop ${opts.top} configs (cross-map discrimination):`);
  console.log(`  rank  config                                comp   discLOO  rel    tStab  median  timeout`);
  for (let i = 0; i < Math.min(opts.top, sorted.length); i++) {
    const c = sorted[i];
    console.log(
      `  ${String(i+1).padStart(3)}.  ${c.name.padEnd(36)}  ` +
      `${fmt(c.composite)} ${fmt(c.discLOO)}  ${fmt(c.reliability)} ` +
      `${fmt(c.medianTStable, 0).padStart(5)}  ${fmt(c.medianTicks, 0).padStart(5)}  ${fmt(c.timeoutRate, 2)}`,
    );
  }

  console.log(`\nBottom 5 configs:`);
  for (let i = sorted.length - 5; i < sorted.length; i++) {
    if (i < 0) continue;
    const c = sorted[i];
    console.log(
      `  ${String(i+1).padStart(3)}.  ${c.name.padEnd(36)}  ` +
      `${fmt(c.composite)} ${fmt(c.discLOO)}  ${fmt(c.reliability)} ` +
      `${fmt(c.medianTStable, 0).padStart(5)}  ${fmt(c.medianTicks, 0).padStart(5)}  ${fmt(c.timeoutRate, 2)}`,
    );
  }

  function printAxis(label, rows) {
    console.log(`\nMarginal by ${label}:`);
    console.log(`  key            n    meanDisc  meanRel   meanT   meanComp`);
    for (const r of rows) {
      console.log(`  ${r.key.padEnd(13)} ${String(r.n).padStart(2)}    ` +
        `${fmt(r.meanDisc)}    ${fmt(r.meanRel)}    ${fmt(r.meanT, 0).padStart(4)}    ${fmt(r.meanComp)}`);
    }
  }
  printAxis("size",    bySize);
  printAxis("growth",  byGrowth);
  printAxis("maxArmy", byMaxArmy);
  printAxis("k",       byK);

  // ---------- write json ----------
  if (opts.out) {
    const summary = {
      opts,
      bots: botNames,
      meanRank,
      configs: sorted.map(c => ({
        name: c.name, spec: c.spec, k: c.k,
        ranks: c.ranks, perBot: c.perBot,
        discLOO: c.discLOO, discAll: c.discAll,
        reliability: c.reliability,
        medianTStable: c.medianTStable, p95TStable: c.p95TStable,
        medianTicks: c.medianTicks, timeoutRate: c.timeoutRate,
        composite: c.composite,
      })),
      marginals: { bySize, byGrowth, byMaxArmy, byK },
    };
    writeFileSync(opts.out, JSON.stringify(summary, null, 2));
    console.log(`\nWrote ${opts.out}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
