// Tournament schedulers. Two modes:
//
//   runFfaTournament — every strategy plays in every match (legacy). Useful
//                      when N is small enough to fit on one map.
//   runPoolTournament — sample K strategies per match, run M matches. Use
//                       this when you have many strategies and want to rank
//                       them by aggregate performance over varied lineups.
//
// Both share aggregation logic (Borda points, win rate, avg rank, etc.).

import { runMatch } from "./arena.js";
import { mulberry32 } from "../src/core/rng.js";

// ---------------------------------------------------------- aggregation

function blankRow(s) {
  return {
    name: s.name,
    author: s.author ?? "",
    played: 0,
    wins: 0,
    survived: 0,
    points: 0,
    totalRank: 0,
    totalTerritory: 0,
    totalEliminationTick: 0,
    eliminationCount: 0,
  };
}

function recordResult(standings, result) {
  const slots = result.ranking.length;
  for (let i = 0; i < slots; i++) {
    const r = result.ranking[i];
    const s = standings.get(r.strategy);
    if (!s) continue;
    s.played++;
    s.totalRank += i + 1;
    s.points += slots - 1 - i; // Borda
    s.totalTerritory += r.territory;
    if (r.survived) s.survived++;
    if (i === 0 && r.survived) s.wins++;
    if (r.eliminatedAt != null) {
      s.totalEliminationTick += r.eliminatedAt;
      s.eliminationCount++;
    }
  }
}

function finalizeStandings(standings) {
  return [...standings.values()]
    .map((s) => ({
      ...s,
      avgRank: s.played ? s.totalRank / s.played : 0,
      avgTerritory: s.played ? s.totalTerritory / s.played : 0,
      avgEliminationTick: s.eliminationCount ? s.totalEliminationTick / s.eliminationCount : null,
      winRate: s.played ? s.wins / s.played : 0,
      survivalRate: s.played ? s.survived / s.played : 0,
      pointsPerGame: s.played ? s.points / s.played : 0,
    }))
    .sort((a, b) =>
      b.pointsPerGame - a.pointsPerGame ||
      a.avgRank - b.avgRank ||
      b.points - a.points,
    );
}

// ---------------------------------------------------------- FFA (legacy)

export function runFfaTournament({
  strategies,
  map,
  rounds = 10,
  baseSeed = 1,
  maxTicks = 4000,
  onMatch = null,
}) {
  const N = strategies.length;
  if (N < 2) throw new Error("Need at least 2 strategies");

  const standings = new Map(strategies.map((s) => [s.name, blankRow(s)]));
  const positions = map.positions(N);
  const results = [];

  for (let round = 0; round < rounds; round++) {
    const offset = round % N;
    const lineup = strategies.map((_, i) => strategies[(i + offset) % N]);
    const seed = baseSeed + round;

    const result = runMatch({
      strategies: lineup,
      mapConfig: map.config,
      startPositions: positions,
      seed,
      maxTicks,
    });

    onMatch?.(round, result, lineup);
    results.push({ round, seed, lineup: lineup.map((s) => s.name), ...result });
    recordResult(standings, result);
  }

  return { standings: finalizeStandings(standings), results };
}

// ---------------------------------------------------------- pool play

// Deterministic random sample of `k` distinct items from `items`.
function sample(items, k, rng) {
  const pool = items.slice();
  const out = [];
  for (let i = 0; i < k; i++) {
    const j = Math.floor(rng() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}

export function runPoolTournament({
  strategies,
  map,
  poolSize,
  matches = 200,
  baseSeed = 1,
  maxTicks = 4000,
  onMatch = null,
}) {
  const N = strategies.length;
  if (N < 2) throw new Error("Need at least 2 strategies");
  const k = Math.min(poolSize, N);
  if (k < 2) throw new Error(`pool size must be >= 2 (got ${k})`);

  const standings = new Map(strategies.map((s) => [s.name, blankRow(s)]));
  const positions = map.positions(k);
  const results = [];
  // Sampling RNG runs separately from the per-match game RNG so that match
  // seeds remain independently reproducible.
  const sampleRng = mulberry32(baseSeed ^ 0x9e3779b9);

  for (let m = 0; m < matches; m++) {
    const lineup = sample(strategies, k, sampleRng);
    const seed = baseSeed + m;

    const result = runMatch({
      strategies: lineup,
      mapConfig: map.config,
      startPositions: positions,
      seed,
      maxTicks,
    });

    onMatch?.(m, result, lineup);
    results.push({ match: m, seed, lineup: lineup.map((s) => s.name), ...result });
    recordResult(standings, result);
  }

  return { standings: finalizeStandings(standings), results };
}

// Back-compat alias for older callers.
export const runTournament = runFfaTournament;
