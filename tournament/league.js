// League scheduler: organize strategies into fixed-size tiers by current
// global rating, play a pool-play mini-tournament inside each tier per
// season, then re-fit ratings between seasons so the next season's tier
// composition reflects updated skill estimates.
//
// Tiers exist for one reason: PL gets sharp signal from matches between
// similar-skill bots, weak signal from blowouts. Sorting by current
// rating and bucketing into tiers keeps each match informative. The
// global ranking lives in tournament/rankings.json — it is the only
// source of truth for "who is best." This runner just generates good
// matches and writes them to the match log; it does not produce a
// ranking on its own.
//
// Inputs:
//   strategies        - all bots that should compete this run
//   tierSize          - bots per tier (last tier may be smaller)
//   seasons           - number of seasons to play
//   matchesPerSeason  - matches per tier per season
//   poolSize          - bots drawn from a tier per match (K of N)
//   seedRatings       - { get(name) -> rating } for initial ordering;
//                       missing names get a neutral default (1000)
//   onSeasonRefit     - (seasonIdx) => updated { get(name) -> rating }
//                       or null to keep the previous ordering. Called
//                       between seasons so the runner can call out to
//                       a PL refit on the accumulated match log.

import { runPoolTournament } from "./scheduler.js";

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const DEFAULT_RATING = 1000;

function sortByRating(strategies, ratings) {
  const get = ratings?.get ? (n) => ratings.get(n) : () => DEFAULT_RATING;
  return [...strategies].sort((a, b) => {
    const diff = get(b.name) - get(a.name);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

export function runLeague({
  strategies,
  map,
  tierSize = 10,
  seasons = 3,
  matchesPerSeason = 20,
  poolSize = 6,
  baseSeed = 1,
  maxTicks = 4000,
  seedRatings = null,
  onMatch = null,            // (seasonIdx, tierIdx, matchIdx, result, lineup)
  onSeasonStart = null,      // (seasonIdx, tiers)
  onSeasonEnd = null,        // (seasonIdx, tiers)
  onSeasonRefit = null,      // (seasonIdx) => updated ratings | null
}) {
  if (strategies.length < tierSize) {
    throw new Error(`Need at least tierSize=${tierSize} strategies, got ${strategies.length}`);
  }

  let ordered = sortByRating(strategies, seedRatings);
  let tiers = chunk(ordered, tierSize);

  for (let season = 0; season < seasons; season++) {
    onSeasonStart?.(season, tiers);

    for (let t = 0; t < tiers.length; t++) {
      const tier = tiers[t];
      if (tier.length < 2) continue;
      // Per-tier seed slice so seasons & tiers reproduce independently.
      const tierSeed = (baseSeed + season * 100003 + t * 1009) >>> 0;
      const k = Math.min(poolSize, tier.length);
      runPoolTournament({
        strategies: tier,
        map,
        poolSize: k,
        matches: matchesPerSeason,
        baseSeed: tierSeed,
        maxTicks,
        onMatch: onMatch
          ? (m, result, lineup) => onMatch(season, t, m, result, lineup)
          : null,
      });
    }

    onSeasonEnd?.(season, tiers);

    // Re-fit between seasons so next season's tiers reflect the matches
    // we just played. Skipped after the last season — there is no "next."
    if (season < seasons - 1 && onSeasonRefit) {
      const updated = onSeasonRefit(season);
      if (updated) {
        ordered = sortByRating(strategies, updated);
        tiers = chunk(ordered, tierSize);
      }
    }
  }

  return {
    tiers: tiers.map((t) => t.map((s) => s.name)),
    final: tiers.flat().map((s) => s.name),
  };
}
