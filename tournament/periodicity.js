#!/usr/bin/env node
// Sweep seeds for matches where one strategy's strength signal shows
// strong periodic oscillation, then unwind the period with an FFT.
//
//   node tournament/periodicity.js                                # default sweep
//   node tournament/periodicity.js --bot Membrane --seeds 1-500   # explicit
//   node tournament/periodicity.js --lineup Membrane,SlowAndSteady,Trinity,Hunter,Vampire,Berserker
//   node tournament/periodicity.js --top 5 --dump                 # also dump series for top hits
//
// The signal is the bot's per-tick total strength while it is alive.
// We linearly detrend it (so the long-term ramp doesn't dominate the
// spectrum), apply a Hann window, run a radix-2 FFT, and score the
// result by peak-amplitude / median-amplitude in the periodic band
// (periods 4..40 ticks). Seeds with the strongest peak relative to
// the rest of the spectrum are reported.

import { Game } from "../src/core/Game.js";
import { Player } from "../src/core/Player.js";
import { mulberry32 } from "../src/core/rng.js";
import { getStrategy } from "../src/strategies/index.js";
import { MAPS } from "./maps.js";

// Most core strategies are deterministic, so the same lineup at the same
// starting positions plays out identically regardless of game seed. To
// actually explore the seed space we permute which lineup slot occupies
// which ring position using a seed-derived RNG. The watched bot stays
// in its declared lineup spot (we just track it by name).
function shuffleSeeded(arr, seed) {
  const rng = mulberry32(seed * 2654435761 >>> 0 || 1);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const PALETTE = [
  { color: "#ff4d6d", accent: "#ff8fa3" },
  { color: "#3ea6ff", accent: "#8ecbff" },
  { color: "#a16bff", accent: "#cdb4ff" },
  { color: "#52e0a4", accent: "#a8f3d2" },
  { color: "#ffb84d", accent: "#ffd699" },
  { color: "#f97aff", accent: "#fbc2ff" },
  { color: "#ffe066", accent: "#fff3a3" },
  { color: "#7cffb2", accent: "#bbffd6" },
];

function parseArgs(argv) {
  const opts = {
    bot: "Membrane",
    lineup: ["Membrane", "SlowAndSteady", "Trinity", "Hunter", "Vampire", "Berserker"],
    map: "arena",
    seeds: [1, 400],
    minLength: 256,
    maxTicks: 4000,
    top: 8,
    minPeriod: 4,
    maxPeriod: 40,
    dump: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--bot": opts.bot = next(); break;
      case "--lineup": opts.lineup = next().split(",").map(s => s.trim()); break;
      case "--map": opts.map = next(); break;
      case "--seeds": {
        const [lo, hi] = next().split("-").map(s => parseInt(s, 10));
        opts.seeds = [lo, hi ?? lo];
        break;
      }
      case "--min-length": opts.minLength = parseInt(next(), 10); break;
      case "--ticks": opts.maxTicks = parseInt(next(), 10); break;
      case "--top": opts.top = parseInt(next(), 10); break;
      case "--min-period": opts.minPeriod = parseFloat(next()); break;
      case "--max-period": opts.maxPeriod = parseFloat(next()); break;
      case "--dump": opts.dump = true; break;
      default:
        console.error(`Unknown option: ${a}`);
        process.exit(1);
    }
  }
  return opts;
}

// Run a single match, recording one player's total strength every tick.
// Returns { series, ticks, alive }.
function runAndRecord({ lineup, mapPreset, seed, maxTicks, watchSlot }) {
  const map = MAPS[mapPreset];
  const game = new Game({ ...map.config, seed, maxHistory: 0 });
  // Permute ring positions so the seed actually influences the layout.
  const slotOrder = shuffleSeeded(lineup.map((_, i) => i), seed);
  const players = lineup.map((s, i) => new Player({
    name: `${s.name}#${i + 1}`,
    color: PALETTE[i % PALETTE.length].color,
    accent: PALETTE[i % PALETTE.length].accent,
    strategy: s,
  }));
  players.forEach(p => game.addPlayer(p));
  const positions = map.positions(lineup.length);
  positions.forEach((pos, i) => {
    const slot = slotOrder[i];
    game.placeArmy({ x: pos.x, y: pos.y, player: players[slot], strength: pos.strength ?? 1 });
  });

  const watched = players[watchSlot];
  const series = [];
  while (game.tick < maxTicks) {
    game.step(1 / 30);
    const alive = game.livingPlayers();
    if (!alive.includes(watched)) break;
    series.push(watched.totals.strength);
    if (alive.length <= 1) break;
  }
  return { series, ticks: game.tick, alive: game.livingPlayers().includes(watched) };
}

// ---- FFT: iterative radix-2 Cooley-Tukey, complex arrays as {re,im} parallel buffers.

function fft(re, im) {
  const n = re.length;
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < half; k++) {
        const tRe = curRe * re[i + k + half] - curIm * im[i + k + half];
        const tIm = curRe * im[i + k + half] + curIm * re[i + k + half];
        re[i + k + half] = re[i + k] - tRe;
        im[i + k + half] = im[i + k] - tIm;
        re[i + k] += tRe;
        im[i + k] += tIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
}

function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

// Linear detrend: subtract least-squares line.
function detrend(y) {
  const n = y.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += y[i]; sxx += i * i; sxy += i * y[i];
  }
  const denom = n * sxx - sx * sx;
  const m = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const b = (sy - m * sx) / n;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = y[i] - (m * i + b);
  return out;
}

function hann(n) {
  const w = new Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
  return w;
}

// Score a series by spectral peak prominence in a period band.
// Returns { peakBin, period, amp, ratio, mags }.
function spectralPeak(series, { minPeriod, maxPeriod }) {
  const n0 = series.length;
  if (n0 < 64) return null;
  const detrended = detrend(series);
  const w = hann(n0);
  const N = nextPow2(n0);
  const re = new Array(N).fill(0);
  const im = new Array(N).fill(0);
  for (let i = 0; i < n0; i++) re[i] = detrended[i] * w[i];
  fft(re, im);
  const mags = new Array(N >> 1);
  for (let k = 0; k < mags.length; k++) {
    mags[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
  }
  // Bin k corresponds to frequency k/N cycles per tick → period = N/k ticks.
  const kMin = Math.max(1, Math.floor(N / maxPeriod));
  const kMax = Math.min(mags.length - 1, Math.ceil(N / minPeriod));
  let peakK = kMin, peakAmp = -Infinity;
  for (let k = kMin; k <= kMax; k++) {
    if (mags[k] > peakAmp) { peakAmp = mags[k]; peakK = k; }
  }
  // Background = median of in-band magnitudes (robust to the peak itself).
  const band = mags.slice(kMin, kMax + 1).slice().sort((a, b) => a - b);
  const median = band[Math.floor(band.length / 2)] || 1e-12;
  // Parabolic interpolation around peakK for sub-bin period precision.
  let kInterp = peakK;
  if (peakK > kMin && peakK < kMax) {
    const a = mags[peakK - 1], b = mags[peakK], c = mags[peakK + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) kInterp = peakK + 0.5 * (a - c) / denom;
  }
  return {
    peakBin: peakK,
    period: N / kInterp,
    amp: peakAmp,
    ratio: peakAmp / median,
    N,
    mags,
  };
}

function ascii(series, width = 60, height = 10) {
  if (series.length === 0) return "";
  let lo = Infinity, hi = -Infinity;
  for (const v of series) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi - lo < 1e-9) hi = lo + 1;
  const step = Math.max(1, Math.floor(series.length / width));
  const cols = [];
  for (let i = 0; i < series.length; i += step) {
    let s = 0, c = 0;
    for (let j = i; j < Math.min(series.length, i + step); j++) { s += series[j]; c++; }
    cols.push(s / c);
  }
  const rows = [];
  for (let r = height - 1; r >= 0; r--) {
    const yLo = lo + (hi - lo) * r / height;
    const yHi = lo + (hi - lo) * (r + 1) / height;
    let line = "";
    for (const v of cols) line += (v >= yLo && v <= yHi + 1e-9) ? "*" : " ";
    rows.push(line);
  }
  return rows.join("\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const lineupStrats = opts.lineup.map(getStrategy);
  const watchSlot = opts.lineup.indexOf(opts.bot);
  if (watchSlot < 0) {
    console.error(`--bot ${opts.bot} is not in --lineup ${opts.lineup.join(",")}`);
    process.exit(1);
  }

  const [seedLo, seedHi] = opts.seeds;
  console.log(`Sweeping seeds ${seedLo}..${seedHi} on map=${opts.map} lineup=${opts.lineup.join(",")} watching=${opts.bot}`);
  console.log(`Spectral band: periods ${opts.minPeriod}..${opts.maxPeriod} ticks`);

  const results = [];
  for (let seed = seedLo; seed <= seedHi; seed++) {
    const { series, ticks, alive } = runAndRecord({
      lineup: lineupStrats,
      mapPreset: opts.map,
      seed,
      maxTicks: opts.maxTicks,
      watchSlot,
    });
    if (series.length < opts.minLength) continue;
    const sp = spectralPeak(series, { minPeriod: opts.minPeriod, maxPeriod: opts.maxPeriod });
    if (!sp) continue;
    results.push({ seed, ticks, alive, length: series.length, ...sp, series });
  }

  if (results.length === 0) {
    console.log("No qualifying seeds (signal shorter than --min-length on every run).");
    return;
  }

  results.sort((a, b) => b.ratio - a.ratio);
  const top = results.slice(0, opts.top);

  console.log(`\nScanned ${seedHi - seedLo + 1} seeds, ${results.length} produced usable signals.`);
  console.log(`\nTop ${top.length} by spectral peak / band-median ratio:\n`);
  console.log(`${"seed".padStart(5)}  ${"period".padStart(7)}  ${"freq".padStart(7)}  ${"peakAmp".padStart(9)}  ${"ratio".padStart(7)}  ${"len".padStart(5)}  alive`);
  console.log("-".repeat(70));
  for (const r of top) {
    console.log(
      `${String(r.seed).padStart(5)}  ` +
      `${r.period.toFixed(2).padStart(7)}  ` +
      `${(1 / r.period).toFixed(4).padStart(7)}  ` +
      `${r.amp.toFixed(2).padStart(9)}  ` +
      `${r.ratio.toFixed(2).padStart(7)}  ` +
      `${String(r.length).padStart(5)}  ` +
      `${r.alive ? "yes" : "no"}`,
    );
  }

  if (opts.dump) {
    for (const r of top) {
      console.log(`\n=== seed ${r.seed} (period ≈ ${r.period.toFixed(2)} ticks, ratio ${r.ratio.toFixed(2)}) ===`);
      console.log(`signal (${r.series.length} ticks, full):`);
      console.log(ascii(r.series, 80, 8));
      // Zoomed window: ~6 cycles centered around mid-match — wide enough to
      // see the oscillation but narrow enough that adjacent peaks aren't
      // smeared into one column.
      const winLen = Math.min(r.series.length, Math.round(r.period * 6));
      const start = Math.max(0, Math.floor((r.series.length - winLen) / 2));
      const window = r.series.slice(start, start + winLen);
      console.log(`zoomed (${winLen} ticks starting at t=${start}):`);
      console.log(ascii(window, Math.min(120, winLen), 8));
      // Spectrum: log-magnitude, in the periodic band.
      const kMin = Math.max(1, Math.floor(r.N / opts.maxPeriod));
      const kMax = Math.min(r.mags.length - 1, Math.ceil(r.N / opts.minPeriod));
      const spec = r.mags.slice(kMin, kMax + 1).map(m => Math.log10(m + 1));
      console.log(`spectrum (periods ${opts.minPeriod}..${opts.maxPeriod} ticks, log magnitude):`);
      console.log(ascii(spec, Math.min(80, spec.length), 6));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
