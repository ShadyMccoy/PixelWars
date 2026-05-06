// Per-config evaluator. Runs N pool-play matches under a candidate map
// config and produces a scoreboard with discrimination / reliability /
// cost metrics. Caller supplies a ground-truth ranking (by bot name) for
// discrimination, and an optional anchor partial-order for calibration.
//
//   evaluateConfig({ config, bots, seeds, groundTruth, anchorPairs })
//     → { perBotScore, ranks, metrics, matches }
//
// "Score" per bot is points-per-game (Borda), exactly as scheduler.js
// computes for the existing tournament. Lower index = better in ranks.

import { runMatch } from "../arena.js";
import { mulberry32 } from "../../src/core/rng.js";
import {
  scoresToRanks,
  spearmanByName,
  pairAccuracy,
  tStable,
} from "./metrics.js";

// Sample k distinct items from arr using rng(); leaves arr untouched.
function sampleWithoutReplacement(arr, k, rng) {
  const pool = arr.slice();
  const out = [];
  for (let i = 0; i < k; i++) {
    const j = Math.floor(rng() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}

function quantile(sortedNums, q) {
  if (sortedNums.length === 0) return null;
  const idx = Math.min(sortedNums.length - 1, Math.floor(q * (sortedNums.length - 1)));
  return sortedNums[idx];
}

// One pass of (M matches, K bots each). Returns aggregate per-bot scores
// and per-match metadata. `seed` controls both lineup sampling and the
// match seeds (offset deterministically) so two calls with the same seed
// produce identical results.
function runMatches({ config, bots, k, matchCount, baseSeed, maxTicks, snapshotEvery }) {
  const sampleRng = mulberry32(baseSeed ^ 0xdeadbeef);
  const points = new Map(bots.map((b) => [b.name, { played: 0, points: 0, wins: 0 }]));
  const matchMeta = [];

  for (let m = 0; m < matchCount; m++) {
    const lineup = sampleWithoutReplacement(bots, k, sampleRng);
    const result = runMatch({
      strategies: lineup,
      mapConfig: config.config,
      startPositions: config.positions(k),
      seed: baseSeed + m,
      maxTicks,
      snapshotEvery,
    });
    const slots = result.ranking.length;
    for (let i = 0; i < slots; i++) {
      const r = result.ranking[i];
      const rec = points.get(r.strategy);
      if (!rec) continue;
      rec.played++;
      rec.points += slots - 1 - i;          // Borda
      if (i === 0 && r.survived) rec.wins++;
    }
    let tStab = result.ticks;
    if (snapshotEvery > 0 && result.snapshots) {
      const finalSlots = result.ranking.map((r) => r.slot);
      tStab = tStable(result.snapshots, finalSlots, result.ticks, 0.9);
    }
    matchMeta.push({
      ticks: result.ticks,
      endReason: result.endReason,
      tStable: tStab,
      timedOut: result.endReason === "max-ticks",
      lineup: lineup.map((b) => b.name),
    });
  }

  // Convert to points-per-game (or 0 if a bot never appeared).
  const perBotScore = {};
  for (const [name, rec] of points) {
    perBotScore[name] = rec.played > 0 ? rec.points / rec.played : 0;
  }
  return { perBotScore, points, matchMeta };
}

export function evaluateConfig({
  config,
  bots,
  k,
  matchCount,
  baseSeed = 1,
  maxTicks = 4000,
  snapshotEvery = 25,
  groundTruth = null,        // { name: rank } or null to skip discrimination
  anchorPairs = null,        // [[winner, loser], ...] or null
  splitHalfReliability = true,
}) {
  if (k > bots.length) {
    throw new Error(`evaluateConfig: k=${k} but only ${bots.length} bots`);
  }

  // ---------- main pass ----------
  const main = runMatches({
    config, bots, k, matchCount, baseSeed, maxTicks, snapshotEvery,
  });
  const ranks = scoresToRanks(main.perBotScore);

  // ---------- discrimination: vs ground truth ----------
  const discrimination = groundTruth ? spearmanByName(ranks, groundTruth) : null;

  // ---------- mid-band discrimination ----------
  // Bin bots into quartiles by ground-truth rank; for each pair WITHIN
  // the same quartile, score whether this map ranks them the same way as
  // ground truth. This isolates the "do we rank the middle correctly"
  // signal from the "we got the obvious top vs bottom right" signal.
  let midBand = null;
  if (groundTruth) {
    const sharedNames = Object.keys(ranks).filter((n) => n in groundTruth);
    if (sharedNames.length >= 8) {
      const sorted = sharedNames.slice().sort((a, b) => groundTruth[a] - groundTruth[b]);
      const Q = 4;
      const bands = [];
      for (let q = 0; q < Q; q++) {
        const lo = Math.floor((q * sorted.length) / Q);
        const hi = Math.floor(((q + 1) * sorted.length) / Q);
        bands.push(sorted.slice(lo, hi));
      }
      let total = 0, correct = 0;
      for (const band of bands) {
        for (let i = 0; i < band.length; i++) {
          for (let j = i + 1; j < band.length; j++) {
            const a = band[i], b = band[j];
            const gtSign = Math.sign(groundTruth[a] - groundTruth[b]);
            const myySign = Math.sign(ranks[a] - ranks[b]);
            if (gtSign === 0 || myySign === 0) continue;
            total++;
            if (gtSign === myySign) correct++;
          }
        }
      }
      midBand = total > 0 ? correct / total : null;
    }
  }

  // ---------- reliability: split-half ----------
  // Run a second matchCount-sized pass with a different sampling salt;
  // the two halves are then independently-ranked and we correlate. Any
  // map whose ranking flips between two same-size halves is unreliable.
  let reliability = null;
  if (splitHalfReliability && matchCount >= 20) {
    const half = Math.floor(matchCount / 2);
    const passA = runMatches({
      config, bots, k, matchCount: half,
      baseSeed: baseSeed + 1_000_001, maxTicks, snapshotEvery: 0,
    });
    const passB = runMatches({
      config, bots, k, matchCount: half,
      baseSeed: baseSeed + 2_000_003, maxTicks, snapshotEvery: 0,
    });
    const ranksA = scoresToRanks(passA.perBotScore);
    const ranksB = scoresToRanks(passB.perBotScore);
    reliability = spearmanByName(ranksA, ranksB);
  }

  // ---------- anchor pair accuracy ----------
  const anchorAccuracy = anchorPairs ? pairAccuracy(anchorPairs, ranks) : null;

  // ---------- cost ----------
  const ticksSorted = main.matchMeta.map((m) => m.ticks).sort((a, b) => a - b);
  const tStableSorted = main.matchMeta.map((m) => m.tStable).sort((a, b) => a - b);
  const timeouts = main.matchMeta.filter((m) => m.timedOut).length;

  const metrics = {
    discrimination,
    midBand,
    reliability,
    anchorAccuracy,
    medianTicks: quantile(ticksSorted, 0.5),
    p95Ticks: quantile(ticksSorted, 0.95),
    medianTStable: quantile(tStableSorted, 0.5),
    p95TStable: quantile(tStableSorted, 0.95),
    timeoutRate: main.matchMeta.length > 0 ? timeouts / main.matchMeta.length : 0,
    matches: main.matchMeta.length,
  };
  metrics.composite = composite(metrics);

  return {
    perBotScore: main.perBotScore,
    ranks,
    metrics,
    matches: main.matchMeta,
  };
}

// Composite score: prioritize discrimination, but heavily penalize
// timeouts and slow t_stable. We always want positive numbers; clip at
// 0 if any signal is missing or negative (a map that ranks the wrong
// direction is worse than useless).
export function composite(m) {
  const disc = m.discrimination ?? 0;
  const mid  = m.midBand ?? 0;
  const rel  = m.reliability ?? 0;
  const tStab = m.medianTStable ?? 1;
  // Smoothly penalize timeouts: 0% → 1.0, 33% → 0.5, 67% → 0.
  const timeoutPenalty = Math.max(0, 1 - 1.5 * (m.timeoutRate ?? 0));
  // Don't clip negative components — a map whose discrimination is
  // negative is anti-correlated with truth, and crediting positive
  // midBand on top of that would hide the failure. If the unclipped
  // average is non-positive the whole score is zero.
  const info = 0.5 * disc + 0.5 * mid;
  if (info <= 0) return 0;
  const reliabilityFactor = Math.max(0, rel);
  // Normalize tStable to a reference of 200 ticks so the score is O(1)
  // when the map resolves around there.
  return (info * reliabilityFactor * 200 / Math.max(50, tStab)) * timeoutPenalty;
}
