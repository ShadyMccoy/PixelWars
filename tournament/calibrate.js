#!/usr/bin/env node
// Tech calibration harness. Three modes:
//
//   --regress      Random tech mirror matches; fit winrate ~ Δtech to
//                  identify per-knob marginal value.
//   --substitute   For each pair of knobs (A,B), sweep allocations
//                  against a 50/50 anchor; print winrate vs allocation
//                  to detect monotonic dominance.
//   --pure         Pure-knob duels: every pair {A:100} vs {B:100} run
//                  many seeds. Quick OP smoke test.
//
// All modes default to the Berserker strategy on the arena map. Strategy
// can be overridden via --strategy. Mirror matches are pure 1v1.
//
// Output is a printable summary plus, if --csv DIR is set, raw match
// rows written as CSVs for downstream analysis.

import { runMatch } from "./arena.js";
import { MAPS } from "./maps.js";
import { getStrategy } from "../src/strategies/index.js";
import { KNOBS, NEUTRAL_TECH, techFromPartial, validateTech } from "../src/core/Tech.js";
import { mulberry32 } from "../src/core/rng.js";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const HELP = `Usage: node tournament/calibrate.js [mode] [options]

Modes (pick one):
  --regress              Random mirror matches; fit winrate ~ Δtech.
  --substitute           Pairwise knob substitution sweep.
  --pure                 Pure-knob duels: {A:100} vs {B:100}.

Options:
  --strategy NAME        Strategy used in mirror matches (default Berserker)
  --map NAME             Map preset (default arena)
  --matches N            Random tech vector pairs (regress only, default 400)
  --seeds N              Seeds per matchup (default 5)
  --ticks N              Max ticks per match (default 4000)
  --csv DIR              Write raw match rows to <dir>/<mode>.csv
  --help                 This message
`;

function parseArgs(argv) {
  const opts = {
    mode: null,
    strategy: "Berserker",
    map: "arena",
    matches: 400,
    seeds: 5,
    ticks: 4000,
    csv: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--regress": opts.mode = "regress"; break;
      case "--substitute": opts.mode = "substitute"; break;
      case "--pure": opts.mode = "pure"; break;
      case "--strategy": opts.strategy = next(); break;
      case "--map": opts.map = next(); break;
      case "--matches": opts.matches = parseInt(next(), 10); break;
      case "--seeds": opts.seeds = parseInt(next(), 10); break;
      case "--ticks": opts.ticks = parseInt(next(), 10); break;
      case "--csv": opts.csv = next(); break;
      case "--help": case "-h": console.log(HELP); process.exit(0);
      default: console.error(`Unknown option: ${a}`); console.error(HELP); process.exit(1);
    }
  }
  if (!opts.mode) { console.error(HELP); process.exit(1); }
  return opts;
}

// ---------------------------------------------------------- match helpers

function mirrorMatchup({ strategy, techA, techB, seeds, mapPreset, maxTicks }) {
  // Run `seeds` mirror matches alternating which side starts at slot 0,
  // so slot-position bias cancels. Returns {winsA, winsB, draws, total}.
  const map = MAPS[mapPreset];
  const positions = map.positions(2);
  let winsA = 0, winsB = 0, draws = 0;
  for (let s = 0; s < seeds; s++) {
    const swap = (s & 1) === 1;
    const left  = swap ? techB : techA;
    const right = swap ? techA : techB;
    const labelL = swap ? "B" : "A";
    const result = runMatch({
      strategies: [
        { strategy, tech: left,  name: `${strategy.name}-${labelL}` },
        { strategy, tech: right, name: `${strategy.name}-${labelL === "A" ? "B" : "A"}` },
      ],
      mapConfig: map.config,
      startPositions: positions,
      seed: s + 1,
      maxTicks,
    });
    const winner = result.ranking[0];
    const tag = winner.entryName.endsWith("-A") ? "A" : "B";
    if (result.endReason === "mutual-destruction") draws++;
    else if (winner.survived || winner.territory > 0) {
      if (tag === "A") winsA++; else winsB++;
    } else draws++;
  }
  return { winsA, winsB, draws, total: seeds };
}

// Sample integer tech vector summing to 100, biased toward the simplex
// interior so we get a usable spread of vectors.
function sampleTech(rng) {
  // Generate 5 random doubles, normalize to 100, round, fix rounding.
  const xs = KNOBS.map(() => -Math.log(1 - rng()));
  const sum = xs.reduce((s, x) => s + x, 0);
  const raw = xs.map((x) => (x / sum) * 100);
  const floored = raw.map(Math.floor);
  let used = floored.reduce((s, x) => s + x, 0);
  // Distribute the rounding error to the largest fractional remainders.
  const fracs = raw.map((v, i) => ({ i, frac: v - floored[i] }));
  fracs.sort((a, b) => b.frac - a.frac);
  let leftover = 100 - used;
  for (let k = 0; k < leftover; k++) floored[fracs[k % fracs.length].i]++;
  const tech = {};
  KNOBS.forEach((k, i) => (tech[k] = floored[i]));
  return validateTech(tech);
}

// ---------------------------------------------------------- regress mode

// Solve a small dense linear system Ax=b via Gauss-Jordan. n<=8 here.
function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // Pivot
    let p = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[p][col])) p = r;
    if (Math.abs(M[p][col]) < 1e-12) throw new Error("Singular matrix");
    if (p !== col) [M[col], M[p]] = [M[p], M[col]];
    const piv = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

function runRegress(opts) {
  const strategy = getStrategy(opts.strategy);
  const rng = mulberry32(0xc0ffee);
  // Features: intercept + Δmove, Δstack, Δprod, Δatk (Δdef dropped due to
  // sum-to-zero constraint). Targets: winrate of A (1.0 win, 0.5 draw, 0).
  const FEAT = ["intercept", "dmove", "dstack", "dprod", "datk"];
  const rows = [];
  for (let m = 0; m < opts.matches; m++) {
    const techA = sampleTech(rng);
    const techB = sampleTech(rng);
    const r = mirrorMatchup({
      strategy, techA, techB, seeds: opts.seeds,
      mapPreset: opts.map, maxTicks: opts.ticks,
    });
    const score = (r.winsA + 0.5 * r.draws) / r.total;
    rows.push({
      techA, techB, score,
      dmove: techA.move - techB.move,
      dstack: techA.stack - techB.stack,
      dprod: techA.prod - techB.prod,
      datk: techA.atk - techB.atk,
      ddef: techA.def - techB.def,
    });
  }
  // Normal equations
  const X = rows.map((r) => [1, r.dmove, r.dstack, r.dprod, r.datk]);
  const y = rows.map((r) => r.score);
  const XtX = Array(5).fill(0).map(() => Array(5).fill(0));
  const Xty = Array(5).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < 5; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < 5; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  const beta = solveLinearSystem(XtX, Xty);

  // RSS for confidence-ish reporting.
  let rss = 0, tss = 0;
  const ymean = y.reduce((s, v) => s + v, 0) / y.length;
  for (let i = 0; i < X.length; i++) {
    const pred = X[i].reduce((s, v, a) => s + v * beta[a], 0);
    rss += (y[i] - pred) ** 2;
    tss += (y[i] - ymean) ** 2;
  }
  const r2 = 1 - rss / tss;

  console.log(`Regression: strategy=${opts.strategy} map=${opts.map} matchups=${opts.matches} seedsEach=${opts.seeds}`);
  console.log(`  R² = ${r2.toFixed(4)}  (n=${rows.length})`);
  console.log(`  intercept = ${beta[0].toFixed(4)} (~0.5 if A/B order doesn't bias outcome)`);
  console.log(`  per-point coefficients (winrate gain per +1 of knob, taking the point from def):`);
  for (let i = 1; i < 5; i++) {
    console.log(`    ${FEAT[i].padEnd(8)} = ${beta[i] >= 0 ? "+" : ""}${beta[i].toFixed(5)}`);
  }
  // Implied def coefficient (since Δdef = -(Δmove+Δstack+Δprod+Δatk),
  // the model's response to +1 def is 0 - sum(other coefs) relative to
  // the regression's reference. Reported for symmetry.
  const implied = -(beta[1] + beta[2] + beta[3] + beta[4]);
  console.log(`    ddef     = ${implied >= 0 ? "+" : ""}${implied.toFixed(5)}  (implied; dropped from regression)`);
  return { rows, beta, r2, FEAT };
}

// ---------------------------------------------------------- substitute mode

function runSubstitute(opts) {
  const strategy = getStrategy(opts.strategy);
  const STEP = 10;
  const rows = [];
  console.log(`Substitution sweep: strategy=${opts.strategy} map=${opts.map} seedsEach=${opts.seeds}`);
  console.log(`  Each row: A's tech is {KA:a, KB:100-a}, B's is the 50/50 anchor {KA:50, KB:50}.`);
  console.log(`  Other knobs fixed at 0 to isolate the pair.\n`);
  for (let i = 0; i < KNOBS.length; i++) {
    for (let j = i + 1; j < KNOBS.length; j++) {
      const KA = KNOBS[i], KB = KNOBS[j];
      const anchor = techFromPartial({ [KA]: 50, [KB]: 50 });
      console.log(`${KA} vs ${KB}:`);
      console.log(`  ${KA.padStart(5)}/${KB.padEnd(5)}    winrate(A)`);
      for (let a = 0; a <= 100; a += STEP) {
        const sweep = techFromPartial({ [KA]: a, [KB]: 100 - a });
        const r = mirrorMatchup({
          strategy, techA: sweep, techB: anchor,
          seeds: opts.seeds, mapPreset: opts.map, maxTicks: opts.ticks,
        });
        const score = (r.winsA + 0.5 * r.draws) / r.total;
        console.log(`     ${String(a).padStart(3)}/${String(100 - a).padEnd(3)}      ${score.toFixed(3)}`);
        rows.push({ knobA: KA, knobB: KB, allocA: a, score, total: r.total });
      }
      console.log("");
    }
  }
  return { rows };
}

// ---------------------------------------------------------- pure mode

function runPure(opts) {
  const strategy = getStrategy(opts.strategy);
  console.log(`Pure-knob duels: strategy=${opts.strategy} map=${opts.map} seedsEach=${opts.seeds}\n`);
  console.log(`  ${"knob A".padEnd(8)} vs ${"knob B".padEnd(8)}  winA/draws/winB`);
  const rows = [];
  for (let i = 0; i < KNOBS.length; i++) {
    for (let j = i + 1; j < KNOBS.length; j++) {
      const KA = KNOBS[i], KB = KNOBS[j];
      const techA = techFromPartial({ [KA]: 100 });
      const techB = techFromPartial({ [KB]: 100 });
      const r = mirrorMatchup({
        strategy, techA, techB,
        seeds: opts.seeds, mapPreset: opts.map, maxTicks: opts.ticks,
      });
      const score = (r.winsA + 0.5 * r.draws) / r.total;
      console.log(`  ${KA.padEnd(8)} vs ${KB.padEnd(8)}  ${r.winsA}/${r.draws}/${r.winsB}  (winA=${score.toFixed(3)})`);
      rows.push({ knobA: KA, knobB: KB, ...r, scoreA: score });
    }
  }
  return { rows };
}

// ---------------------------------------------------------- csv writer

async function writeCsv(path, rows) {
  await mkdir(dirname(path), { recursive: true });
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => {
      const v = r[c];
      if (v == null) return "";
      if (typeof v === "object") return JSON.stringify(v).replace(/"/g, '""');
      return String(v);
    }).join(","));
  }
  await writeFile(path, lines.join("\n") + "\n", "utf8");
  console.log(`\nWrote ${rows.length} rows to ${path}`);
}

// ---------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let result;
  if (opts.mode === "regress") result = runRegress(opts);
  else if (opts.mode === "substitute") result = runSubstitute(opts);
  else if (opts.mode === "pure") result = runPure(opts);
  if (opts.csv && result?.rows) {
    await writeCsv(`${opts.csv}/${opts.mode}.csv`, result.rows);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
