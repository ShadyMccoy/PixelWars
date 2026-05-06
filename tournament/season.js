// Season runner. A "season" pairs the rating-driven tournament with a
// top-of-pool round robin, and emits two champions:
//
//   - rating-leader: the highest-rated bot at the end of the rating phase
//   - round-robin:   the winner of an FFA round robin among the top N
//                    by rating (typically run on a larger map so all
//                    finalists fit in the same arena)
//
// Both bots earn the right to spawn a descendant in the next deliverable.
// The same bot can win both, by design — dominant bots get two spawns
// per season.

import { runRatingTournament, runFfaTournament } from "./scheduler.js";

export function runSeason({
  strategies,
  map,
  poolSize = 6,
  matches = 200,
  baseSeed = 1,
  maxTicks = 4000,
  rrMap = null,
  rrTopN = 10,
  rrRounds = 21,
  onMatch = null,
}) {
  if (strategies.length < 2) throw new Error("Need at least 2 strategies");

  const ratingResult = runRatingTournament({
    strategies,
    map,
    poolSize,
    matches,
    baseSeed,
    maxTicks,
    onMatch: onMatch
      ? (m, result, lineup) => onMatch("rating", m, result, lineup)
      : null,
  });

  const ratingChampion = ratingResult.standings[0]?.name ?? null;

  const topN = Math.max(2, Math.min(rrTopN, ratingResult.standings.length));
  const topNames = ratingResult.standings.slice(0, topN).map((s) => s.name);
  const topStrategies = topNames
    .map((name) => strategies.find((s) => s.name === name))
    .filter(Boolean);

  let roundRobin = null;
  let rrChampion = null;
  if (topStrategies.length >= 2) {
    roundRobin = runFfaTournament({
      strategies: topStrategies,
      map: rrMap ?? map,
      rounds: rrRounds,
      baseSeed: (baseSeed + 100003) >>> 0,
      maxTicks,
      onMatch: onMatch
        ? (m, result, lineup) => onMatch("round-robin", m, result, lineup)
        : null,
    });
    rrChampion = roundRobin.standings[0]?.name ?? null;
  }

  const champions = [];
  if (ratingChampion) champions.push({ kind: "rating-leader", name: ratingChampion });
  if (rrChampion) champions.push({ kind: "round-robin", name: rrChampion });

  return {
    rating: ratingResult,
    roundRobin,
    champions,
    topField: topNames,
  };
}
