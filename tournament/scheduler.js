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
import { fitPlackettLuce } from "./plackettLuce.js";

// Rating shape mirrors the original Glicko output (rating, rd, played)
// so downstream consumers — season.js, spawn.js, SeasonViewer.js —
// don't need to know we swapped the underlying model. RD is a synthetic
// uncertainty derived from match count: 350 for unplayed bots, falling
// to ~50 once a bot has many games. PL itself doesn't expose RD; this
// is a stand-in that preserves the "new bots are uncertain" semantics.
const RATING_BASE = 1000;
const RATING_SCALE = 400;
const NEW_RD = 350;
const MIN_RD = 50;

function skillToRating(skill) {
  return RATING_BASE + RATING_SCALE * Math.log10(skill);
}

function rdFromPlayed(played) {
  if (played <= 0) return NEW_RD;
  return Math.max(MIN_RD, NEW_RD / Math.sqrt(played + 1));
}

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

function finalizeStandings(standings, ratings = null) {
  const rows = [...standings.values()].map((s) => {
    const r = ratings?.get(s.name);
    return {
      ...s,
      avgRank: s.played ? s.totalRank / s.played : 0,
      avgTerritory: s.played ? s.totalTerritory / s.played : 0,
      avgEliminationTick: s.eliminationCount ? s.totalEliminationTick / s.eliminationCount : null,
      winRate: s.played ? s.wins / s.played : 0,
      survivalRate: s.played ? s.survived / s.played : 0,
      pointsPerGame: s.played ? s.points / s.played : 0,
      rating: r ? +r.rating.toFixed(2) : null,
      rd: r ? +r.rd.toFixed(2) : null,
    };
  });
  if (ratings) {
    rows.sort((a, b) =>
      b.rating - a.rating ||
      b.pointsPerGame - a.pointsPerGame ||
      a.avgRank - b.avgRank,
    );
  } else {
    rows.sort((a, b) =>
      b.pointsPerGame - a.pointsPerGame ||
      a.avgRank - b.avgRank ||
      b.points - a.points,
    );
  }
  return rows;
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

// ---------------------------------------------------------- rating-driven
//
// Glicko-style ratings + an information-gain matchmaker. Each match's
// lineup is picked to maximize learning per match: anchor on the most
// uncertain bot, surround it with similarly-rated peers. Replaces the
// tier loop with a single flat ranking.

export function runRatingTournament({
  strategies,
  map,
  poolSize = 6,
  matches = 200,
  baseSeed = 1,
  maxTicks = 4000,
  onMatch = null,
}) {
  // Plackett-Luce-driven analog of the previous Glicko runner. Plays
  // random K-bot matches, then fits PL across all results to produce
  // the final rating. The return shape (standings with rating + rd,
  // ratings object, raw results) matches the old Glicko output so
  // downstream consumers don't need to change.
  const N = strategies.length;
  if (N < 2) throw new Error("Need at least 2 strategies");
  const k = Math.min(poolSize, N);
  if (k < 2) throw new Error(`pool size must be >= 2 (got ${k})`);

  const standings = new Map(strategies.map((s) => [s.name, blankRow(s)]));
  const positions = map.positions(k);
  const results = [];
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

  // Fit PL on every match's full finish order.
  const orderings = results.map((r) => r.ranking.map((e) => e.strategy));
  const { skill } = fitPlackettLuce(orderings);

  const ratings = new Map();
  const ratingsObj = {};
  for (const s of strategies) {
    const sk = skill[s.name] ?? 1;
    const played = standings.get(s.name)?.played ?? 0;
    const r = {
      rating: skillToRating(sk),
      rd: rdFromPlayed(played),
      played,
    };
    ratings.set(s.name, r);
    ratingsObj[s.name] = { ...r };
  }

  return {
    standings: finalizeStandings(standings, ratings),
    ratings: ratingsObj,
    results,
  };
}

// Back-compat alias for older callers.
export const runTournament = runFfaTournament;
