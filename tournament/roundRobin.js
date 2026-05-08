// Round-robin scheduler: for each unordered pair of strategies, run S
// matches at deterministic seeds and aggregate a pairwise score.
//
// Why pairwise (K=2) and not pool play (K=6)? Pool play muddles a "loss"
// with the actions of K-2 other bots. Head-to-head is the cleanest
// signal for "does A actually beat B"; with multiple seeds per pair we
// can separate map/seed luck from a stable style mismatch.
//
// The runner is map-agnostic — pass any MAPS preset that supplies
// positions(2). `duel1` is the default head-to-head preset.
//
// A "pair score" is from A's perspective: 1 per A win, 0 per B win,
// 0.5 per draw. Draws cover both stalemates (max-ticks reached, both
// alive) and mutual-destruction (both eliminated same tick). The
// territory tiebreak baked into arena.js's ranking is *not* counted as
// a win here — territory-tiebreak K=2 finishes are too noisy to
// distinguish from a real win, and PL already handles that with
// stalemate expansion. We only credit decisive matches.

import { runMatch } from "./arena.js";

export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function blankPair(a, b) {
  // Names stored in canonical (sorted) order; A is the first name in
  // the key, B is the second. All scores are from A's perspective.
  return {
    a,
    b,
    games: 0,
    aWins: 0,
    bWins: 0,
    draws: 0,
    aTerritory: 0,
    bTerritory: 0,
    totalTicks: 0,
    seeds: [],
  };
}

function recordPairResult(stats, aName, bName, result) {
  // Map the match's per-name ranking to A's POV. arena.js already
  // sorts by survival → territory → strength, with eliminated tied
  // at the bottom. We also flatten "stalemate winner" into a draw.
  const ranking = result.ranking;
  const aRow = ranking.find((r) => r.strategy === aName);
  const bRow = ranking.find((r) => r.strategy === bName);
  if (!aRow || !bRow) {
    throw new Error(`Pair result missing strategy: a=${aName} b=${bName}`);
  }
  stats.games++;
  stats.aTerritory += aRow.territory;
  stats.bTerritory += bRow.territory;
  stats.totalTicks += result.ticks;
  stats.seeds.push({
    seed: result.seed,
    ticks: result.ticks,
    endReason: result.endReason,
    stalemate: result.stalemate ?? false,
    aTerritory: aRow.territory,
    bTerritory: bRow.territory,
    aSurvived: aRow.survived,
    bSurvived: bRow.survived,
    winner: null, // filled in below
  });
  const last = stats.seeds[stats.seeds.length - 1];

  // Decisive win: exactly one survivor and the match did not stalemate.
  const aOnly = aRow.survived && !bRow.survived;
  const bOnly = bRow.survived && !aRow.survived;
  if (aOnly && !result.stalemate) {
    stats.aWins++;
    last.winner = "a";
  } else if (bOnly && !result.stalemate) {
    stats.bWins++;
    last.winner = "b";
  } else {
    stats.draws++;
    last.winner = "draw";
  }
}

// A's observed score in [0, 1]: wins + 0.5 * draws, divided by games.
export function observedScoreA(stats) {
  if (stats.games === 0) return 0.5;
  return (stats.aWins + 0.5 * stats.draws) / stats.games;
}

// Wilson 95% CI on A's observed score, treating each game as a
// Bernoulli trial with p = score and using the score itself as the
// estimator. Draws contribute 0.5; we coarsely approximate by
// converting to an equivalent count of wins for the binomial CI.
// Good enough for ranking which pairs to look at; not a publication-
// grade interval.
export function scoreCI(stats, z = 1.96) {
  const n = stats.games;
  if (n === 0) return { lo: 0, hi: 1 };
  const p = observedScoreA(stats);
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const rad = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: (center - rad) / denom, hi: (center + rad) / denom };
}

// Run S matches for a single pair at a given pair seed. The match
// seed is `pairSeed + s`; alternate which slot A occupies across seeds
// so map positional asymmetries (slot 0 vs slot 1 spawn point) don't
// systematically advantage one bot.
export function runPair({
  a,
  b,
  map,
  seedsPerPair,
  pairSeed,
  maxTicks,
  onMatch = null,
}) {
  const stats = blankPair(a.name, b.name);
  const positions = map.positions(2);
  for (let s = 0; s < seedsPerPair; s++) {
    // Even s: a in slot 0, b in slot 1. Odd s: swapped. With S=1 there
    // is no swap, so caller-passed odd S values give one extra slot-0
    // seed to A (canonical). Documented in CLI help.
    const lineup = s % 2 === 0 ? [a, b] : [b, a];
    const seed = pairSeed + s;
    const result = runMatch({
      strategies: lineup,
      mapConfig: map.config,
      startPositions: positions,
      seed,
      maxTicks,
    });
    recordPairResult(stats, a.name, b.name, result);
    onMatch?.({ pair: stats, lineup, result, seedIndex: s });
  }
  return stats;
}

// Full all-pairs round-robin. Returns a Map<pairKey, PairStats>.
//
// Pair seeds are derived from baseSeed + (i, j) so each pair has its
// own independent seed slice — re-running with the same baseSeed
// reproduces matches bit-for-bit, and re-rolling a single pair with a
// new baseSeed cleanly avoids re-using already-seen seeds.
export function runRoundRobin({
  strategies,
  map,
  seedsPerPair = 5,
  baseSeed = 1,
  maxTicks = 4000,
  onMatch = null,
  onPair = null,
}) {
  if (strategies.length < 2) {
    throw new Error("Round-robin needs at least 2 strategies");
  }
  // Sort by name so pair iteration is deterministic regardless of
  // caller's input order.
  const sorted = [...strategies].sort((x, y) => x.name.localeCompare(y.name));
  const pairs = new Map();
  let pairIdx = 0;
  const totalPairs = (sorted.length * (sorted.length - 1)) / 2;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const pairSeed = (baseSeed + pairIdx * 1009) >>> 0;
      const stats = runPair({
        a, b, map, seedsPerPair, pairSeed, maxTicks,
        onMatch: onMatch
          ? (info) => onMatch({ ...info, pairIndex: pairIdx, totalPairs })
          : null,
      });
      const key = pairKey(a.name, b.name);
      pairs.set(key, stats);
      onPair?.({ key, stats, pairIndex: pairIdx, totalPairs });
      pairIdx++;
    }
  }
  return { pairs, totalPairs };
}

// Re-roll a specific list of pairs at a *fresh* baseSeed. Used by the
// upset workflow: original RR found A-vs-B looks like an upset; we run
// more seeds with seeds disjoint from the original to ask "is the
// upset stable across seeds, or did we get lucky?" Returns a fresh
// Map<pairKey, PairStats> with the new matches only — caller decides
// whether to merge or compare against the original.
export function rerollPairs({
  pairsToReroll, // [{ a, b }] — strategy objects, not just names
  map,
  seedsPerPair = 5,
  baseSeed = 1,
  maxTicks = 4000,
  onMatch = null,
  onPair = null,
}) {
  const out = new Map();
  for (let i = 0; i < pairsToReroll.length; i++) {
    const { a, b } = pairsToReroll[i];
    const pairSeed = (baseSeed + i * 1009) >>> 0;
    const stats = runPair({
      a, b, map, seedsPerPair, pairSeed, maxTicks,
      onMatch: onMatch
        ? (info) => onMatch({ ...info, pairIndex: i, totalPairs: pairsToReroll.length })
        : null,
    });
    const key = pairKey(a.name, b.name);
    out.set(key, stats);
    onPair?.({ key, stats, pairIndex: i, totalPairs: pairsToReroll.length });
  }
  return { pairs: out };
}
