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
import { expandManyToOrderings } from "./stalemateExpand.js";

// Rating shape mirrors the original Glicko output (rating, rd, played)
// so downstream consumers — season.js, spawn.js, SeasonViewer.js —
// don't need to know we swapped the underlying model. RD is a synthetic
// uncertainty derived from match count, scaling 1/sqrt(N). PL itself
// doesn't expose RD; this is a stand-in that preserves the "new bots
// are uncertain" semantics and drives the info-gain matchmaker.
//
// MIN_RD is intentionally low so that bots at 50 plays still look
// distinctly more uncertain than bots at 400 plays — without that, the
// matchmaker treats every well-played bot as equally calibrated and
// fails to give extra exposure to top-rated newcomers whose ratings
// haven't fully settled.
const RATING_BASE = 1000;
const RATING_SCALE = 400;
const NEW_RD = 350;
const MIN_RD = 5;

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
  const stale = result.stalemate === true;
  for (let i = 0; i < slots; i++) {
    const r = result.ranking[i];
    const s = standings.get(r.strategy);
    if (!s) continue;
    s.played++;
    s.totalRank += i + 1;
    s.points += slots - 1 - i; // Borda
    s.totalTerritory += r.territory;
    if (r.survived) s.survived++;
    // Don't credit a "win" for placing 1st via the territory-tiebreak
    // at stalemate; partial credit comes through the PL fit instead.
    if (i === 0 && r.survived && !stale) s.wins++;
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
// Plackett-Luce ratings + an information-gain matchmaker. Each match's
// lineup is picked to maximize learning per match: anchor on the most
// uncertain bot (highest synthetic RD), surround it with similarly-rated
// peers. When `priors` (rating + played count per bot) are passed in,
// the matchmaker uses them to identify uncertain bots; otherwise lineups
// are sampled uniformly at random.

export function runRatingTournament({
  strategies,
  map,
  poolSize = 6,
  matches = 200,
  baseSeed = 1,
  maxTicks = 4000,
  onMatch = null,
  priors = null,
}) {
  // Plays random or info-gain-targeted K-bot matches, then fits PL
  // across all results to produce the final rating. The return shape
  // (standings with rating + rd, ratings object, raw results) is
  // unchanged so downstream consumers (season.js, spawn.js) don't
  // need to know how lineups were picked.
  const N = strategies.length;
  if (N < 2) throw new Error("Need at least 2 strategies");
  const k = Math.min(poolSize, N);
  if (k < 2) throw new Error(`pool size must be >= 2 (got ${k})`);

  const standings = new Map(strategies.map((s) => [s.name, blankRow(s)]));
  const positions = map.positions(k);
  const results = [];
  const sampleRng = mulberry32(baseSeed ^ 0x9e3779b9);

  // Live state for the info-gain matchmaker: each bot's played count
  // (prior + season-so-far) and current rating estimate. Played count
  // drives synthetic RD; rating drives "rating-close" peer selection.
  const live = new Map();
  for (const s of strategies) {
    const p = priors?.[s.name];
    live.set(s.name, {
      rating: p?.rating ?? RATING_BASE,
      played: p?.played ?? 0,
    });
  }

  for (let m = 0; m < matches; m++) {
    const lineup = priors
      ? pickInfoGainLineup(strategies, live, k, sampleRng)
      : sample(strategies, k, sampleRng);
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
    // Bump played count for the matchmaker's next pick.
    for (const s of lineup) live.get(s.name).played++;
  }

  // Fit PL on every match's full finish order. Stalemate matches are
  // expanded into N synthetic orderings drawn from each survivor's
  // strength+territory share so they get partial credit.
  const { orderings, weights } = expandManyToOrderings(results);
  const { skill } = fitPlackettLuce(orderings, { weights });

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

// Pick a lineup of K bots that maximizes information gain:
//   - anchor on the bot with the highest weighted RD (uncertainty x
//     rating bonus), so brand-new bots win when they exist and, once
//     they're calibrated, top-of-board bots whose ratings are still
//     noisy get priority over equally-uncertain mid-pack bots —
//     misranking at the top costs more than misranking at the bottom
//   - fill with K-1 *known* bots (low-RD, well-rated) sampled from
//     the active pool, so the anchor is calibrated against varied
//     opponents from the established field rather than against other
//     equally-uncertain newcomers
//
// "Known" is defined as RD below the median; that way as new bots
// settle into ratings they automatically join the known pool. The
// sample weights low-RD candidates higher (more reference value)
// while still letting any known bot show up over many matches.
function anchorWeightOf({ rating, played }) {
  // 1 + (rating-1000)/200: a 1000-rated bot scores 1x its RD, a
  // 1200-rated bot 2x. Keeps brand-new (rd=350) bots dominant when
  // they exist, but among bots near the RD floor the rating tilt
  // routes more matches to top-of-board newcomers.
  const rd = rdFromPlayed(played);
  const ratingBonus = 1 + Math.max(0, (rating - RATING_BASE) / 200);
  return rd * ratingBonus;
}

function pickInfoGainLineup(strategies, live, k, rng) {
  let anchor = strategies[0];
  let anchorWeight = anchorWeightOf(live.get(anchor.name));
  for (const s of strategies) {
    const w = anchorWeightOf(live.get(s.name));
    if (w > anchorWeight) { anchor = s; anchorWeight = w; }
  }

  // Split the rest into "known" (RD <= median) and "other" candidates.
  const others = strategies.filter((s) => s !== anchor);
  const rds = others.map((s) => rdFromPlayed(live.get(s.name).played));
  const sortedRds = rds.slice().sort((a, b) => a - b);
  const medianRd = sortedRds[Math.floor(sortedRds.length / 2)] ?? NEW_RD;
  const known = others.filter((s) => rdFromPlayed(live.get(s.name).played) <= medianRd);
  const fallback = known.length >= k - 1 ? known : others;

  // Weighted sample without replacement: lower RD = higher weight.
  // weight = (NEW_RD - rd + 1), so a fresh bot gets weight 1 and a
  // fully-calibrated bot gets weight ~300.
  const lineup = [anchor];
  const pool = fallback.slice();
  while (lineup.length < k && pool.length > 0) {
    const weights = pool.map((s) => {
      const rd = rdFromPlayed(live.get(s.name).played);
      return Math.max(1, NEW_RD - rd + 1);
    });
    const total = weights.reduce((a, w) => a + w, 0);
    let pick = rng() * total;
    let chosen = 0;
    for (let i = 0; i < weights.length; i++) {
      pick -= weights[i];
      if (pick <= 0) { chosen = i; break; }
    }
    lineup.push(pool[chosen]);
    pool.splice(chosen, 1);
  }

  // Fisher-Yates shuffle so seat assignment is randomized.
  for (let i = lineup.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lineup[i], lineup[j]] = [lineup[j], lineup[i]];
  }
  return lineup;
}

// ---------------------------------------------------------- bracket
//
// K=3 single-elimination bracket. Each "tournament" is rounds of 3-bot
// matches: winner of each match advances. Bracket runs until one bot is
// left. We run B such tournaments with independent shuffles+seeds and
// aggregate, since a single K=3 bracket is too noisy to crown a champion
// on its own — the discrimination experiment that justifies the K=3
// bracket map (24x18 g1.8 m12) found per-bracket reliability ~0.3.
//
// Field size must be a power of 3 (3, 9, 27, ...). Caller passes the
// top-N from the rating phase; we round DOWN to the largest fitting
// power of 3.
//
// Champion = bot that won the most bracket finals; tiebreak total round
// wins, then Borda points-per-game across all bracket matches.

export function runBracketTournament({
  strategies,
  map,
  brackets = 5,
  baseSeed = 1,
  maxTicks = 4000,
  onMatch = null,
}) {
  const POOL = 3;
  if (strategies.length < POOL) {
    throw new Error(`Bracket needs at least ${POOL} strategies (got ${strategies.length})`);
  }

  let fieldSize = POOL;
  while (fieldSize * POOL <= strategies.length) fieldSize *= POOL;
  const field = strategies.slice(0, fieldSize);

  const standings = new Map(field.map((s) => [s.name, blankRow(s)]));
  const positions = map.positions(POOL);
  const winners = [];
  const finalWins = new Map();
  const roundWins = new Map();
  const allResults = [];
  for (const s of field) {
    finalWins.set(s.name, 0);
    roundWins.set(s.name, 0);
  }

  for (let b = 0; b < brackets; b++) {
    const seedRng = mulberry32((baseSeed ^ 0xb12c4e7) + b * 100003);
    const shuffled = field.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(seedRng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    let advancing = shuffled;
    let roundIdx = 0;
    while (advancing.length > 1) {
      const groups = advancing.length / POOL;
      const next = [];
      for (let g = 0; g < groups; g++) {
        const lineup = advancing.slice(g * POOL, (g + 1) * POOL);
        const matchSeed = baseSeed + b * 1_000_003 + roundIdx * 10_007 + g;
        const result = runMatch({
          strategies: lineup,
          mapConfig: map.config,
          startPositions: positions,
          seed: matchSeed,
          maxTicks,
        });
        onMatch?.(allResults.length, result, lineup);
        allResults.push({
          bracket: b, round: roundIdx, group: g, seed: matchSeed,
          lineup: lineup.map((s) => s.name), ...result,
        });
        recordResult(standings, result);
        const winnerName = result.ranking[0]?.strategy;
        roundWins.set(winnerName, (roundWins.get(winnerName) ?? 0) + 1);
        const winner = lineup.find((s) => s.name === winnerName);
        if (!winner) throw new Error(`Bracket winner ${winnerName} not in lineup`);
        next.push(winner);
      }
      advancing = next;
      roundIdx++;
    }
    const champion = advancing[0];
    finalWins.set(champion.name, (finalWins.get(champion.name) ?? 0) + 1);
    winners.push({ bracket: b, champion: champion.name });
  }

  const finalized = finalizeStandings(standings);
  const ppgByName = new Map(finalized.map((r) => [r.name, r.pointsPerGame]));
  const overall = field
    .map((s) => ({
      name: s.name,
      finalWins: finalWins.get(s.name) ?? 0,
      roundWins: roundWins.get(s.name) ?? 0,
      pointsPerGame: +(ppgByName.get(s.name) ?? 0).toFixed(3),
    }))
    .sort((a, b) =>
      b.finalWins - a.finalWins ||
      b.roundWins - a.roundWins ||
      b.pointsPerGame - a.pointsPerGame,
    );
  const champion = overall[0]?.name ?? null;

  return {
    standings: finalized,
    overall,
    winners,
    champion,
    fieldSize,
    brackets,
    results: allResults,
  };
}

// Back-compat alias for older callers.
export const runTournament = runFfaTournament;
