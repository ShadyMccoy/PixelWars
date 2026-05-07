// Season runner. A "season" pairs the rating-driven tournament with a
// K=3 bracket phase, and emits two champions:
//
//   - rating-leader: the highest-rated bot at the end of the rating phase
//   - bracket:       the bot that won the most K=3 single-elimination
//                    brackets among the top N by rating, run on a
//                    fast-but-noisy bracket map with multiple
//                    tournaments to average out per-bracket noise
//
// Both bots earn the right to spawn a descendant in the next deliverable.
// The same bot can win both, by design — dominant bots get two spawns
// per season.

import { runRatingTournament, runBracketTournament } from "./scheduler.js";

export function runSeason({
  strategies,
  map,
  poolSize = 6,
  matches = 200,
  baseSeed = 1,
  maxTicks = 4000,
  bracketMap = null,
  bracketTopN = 9,
  brackets = 5,
  onMatch = null,
  priors = null,
}) {
  if (strategies.length < 2) throw new Error("Need at least 2 strategies");

  const ratingResult = runRatingTournament({
    strategies,
    map,
    poolSize,
    matches,
    baseSeed,
    maxTicks,
    priors,
    onMatch: onMatch
      ? (m, result, lineup) => onMatch("rating", m, result, lineup)
      : null,
  });

  const ratingChampion = ratingResult.standings[0]?.name ?? null;

  const topN = Math.max(3, Math.min(bracketTopN, ratingResult.standings.length));
  const topNames = ratingResult.standings.slice(0, topN).map((s) => s.name);
  const topStrategies = topNames
    .map((name) => strategies.find((s) => s.name === name))
    .filter(Boolean);

  let bracket = null;
  let bracketChampion = null;
  if (topStrategies.length >= 3) {
    bracket = runBracketTournament({
      strategies: topStrategies,
      map: bracketMap ?? map,
      brackets,
      baseSeed: (baseSeed + 100003) >>> 0,
      maxTicks,
      onMatch: onMatch
        ? (m, result, lineup) => onMatch("bracket", m, result, lineup)
        : null,
    });
    bracketChampion = bracket.champion;
  }

  const champions = [];
  if (ratingChampion) champions.push({ kind: "rating-leader", name: ratingChampion });
  if (bracketChampion) champions.push({ kind: "bracket", name: bracketChampion });

  return {
    rating: ratingResult,
    bracket,
    champions,
    topField: topNames,
  };
}
