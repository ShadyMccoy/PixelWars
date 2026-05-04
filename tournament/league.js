// League scheduler: organize strategies into fixed-size tiers, play a
// pool-play mini-tournament inside each tier per season, then promote the
// top of each tier and relegate the bottom. Tier sizes stay fixed.
//
// After enough seasons the ranking sorts itself: strong bots float to the
// top tier, weak bots sink to the bottom. Each match is K-of-N drawn from
// a similar-skill pool, so per-match signal is much stronger than fully
// random sampling across the whole population.
//
// The output structure:
//   {
//     final:   [strategyName, ...]      // flat ranking, top to bottom
//     tiers:   [[strategyName, ...]...] // final tier composition + within-tier order
//     seasons: [{ index, tiers: [{ standings, results }, ...] }, ...]
//     flagged: [entry, ...]             // saved-replay entries from every match
//   }

import { runPoolTournament } from "./scheduler.js";

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Rebalance tiers after a season. Each tier is an array of strategies in
// within-tier rank order (best first). Promote the top `promote` of each
// tier upward and relegate the bottom `relegate` downward; sizes preserve
// because every promotion has a matching relegation.
//
// Constraints: assumes `promote === relegate` and uniform tier sizes
// except possibly the last (which may be smaller). With unequal sizes the
// boundary tiers still work as long as promote/relegate <= smallest tier.
function rebalance(tiers, promote, relegate) {
  const T = tiers.length;
  if (T <= 1) return tiers.map((t) => t.slice());
  const out = [];
  for (let i = 0; i < T; i++) {
    const cur = tiers[i];
    const above = i > 0 ? tiers[i - 1] : null;
    const below = i < T - 1 ? tiers[i + 1] : null;

    let next;
    if (i === 0) {
      // Top tier: keep top (size - relegate), pull in top `promote` from below.
      next = cur.slice(0, cur.length - relegate).concat(below.slice(0, promote));
    } else if (i === T - 1) {
      // Bottom tier: pull in bottom `relegate` from above, drop own top `promote`.
      next = above.slice(above.length - relegate).concat(cur.slice(promote));
    } else {
      // Middle: in from above, keep middle, in from below.
      next = above.slice(above.length - relegate)
        .concat(cur.slice(promote, cur.length - relegate))
        .concat(below.slice(0, promote));
    }
    out.push(next);
  }
  return out;
}

export function runLeague({
  strategies,
  map,
  tierSize = 10,
  seasons = 3,
  matchesPerSeason = 20,
  poolSize = 6,
  promote = 2,
  relegate = 2,
  bootstrapMatches = 50,
  baseSeed = 1,
  maxTicks = 4000,
  onMatch = null,         // (seasonIdx, tierIdx, matchIdx, result, lineup)
  onSeasonEnd = null,     // (seasonIdx, tiers, seasonInfo)
}) {
  if (strategies.length < tierSize) {
    throw new Error(`Need at least tierSize=${tierSize} strategies, got ${strategies.length}`);
  }
  if (promote !== relegate) {
    throw new Error(`promote (${promote}) must equal relegate (${relegate}) to keep tier sizes stable`);
  }

  const byName = Object.fromEntries(strategies.map((s) => [s.name, s]));

  // ---------- bootstrap: random pool play across the whole population
  // to produce an initial ranking. Without this, season 1 would just be
  // an arbitrary alphabetical-ish slicing of bots into tiers, which costs
  // a season's worth of churn before the system has any signal.
  let order;
  if (bootstrapMatches > 0) {
    const boot = runPoolTournament({
      strategies,
      map,
      poolSize,
      matches: bootstrapMatches,
      baseSeed,
      maxTicks,
      onMatch: onMatch
        ? (m, result, lineup) => onMatch(-1, -1, m, result, lineup)
        : null,
    });
    order = boot.standings.map((s) => s.name);
  } else {
    order = strategies.map((s) => s.name);
  }

  let tiers = chunk(order.map((name) => byName[name]), tierSize);
  const seasonHistory = [];
  const allResults = [];

  for (let season = 0; season < seasons; season++) {
    const seasonInfo = { index: season, tiers: [] };
    const newTiers = [];

    for (let t = 0; t < tiers.length; t++) {
      const tier = tiers[t];
      // Each tier gets its own seed slice so seasons & tiers reproduce
      // independently. Bit-mixed so concurrent tiers don't share match
      // seeds.
      const tierSeed = (baseSeed + season * 100003 + t * 1009) >>> 0;

      let standings;
      let results;
      if (tier.length < 2) {
        // Single-bot tier — nothing to play. Keep as-is.
        standings = tier.map((s) => ({ name: s.name }));
        results = [];
      } else {
        const k = Math.min(poolSize, tier.length);
        const r = runPoolTournament({
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
        standings = r.standings;
        results = r.results;
      }
      // Reorder the tier in-place by the standings of this season.
      const ordered = standings.map((s) => byName[s.name]);
      newTiers.push(ordered);
      seasonInfo.tiers.push({ index: t, standings, resultsCount: results.length });
      allResults.push(...results.map((res) => ({ season, tier: t, ...res })));
    }

    // Apply promotion/relegation. After this, tiers[i] is the new
    // composition; we re-order on the *next* season's standings, not
    // before.
    tiers = rebalance(newTiers, promote, relegate);
    seasonHistory.push(seasonInfo);
    onSeasonEnd?.(season, tiers, seasonInfo);
  }

  // Final flat ranking: top of tier 0, then tier 1, etc. Within each tier
  // we use the most recent rebalance ordering — which means the top
  // `promote` of each non-top tier are bots that just promoted in (and
  // are still seeded at top of their new tier from last season's
  // standings). Good enough as a final order.
  const final = [];
  for (const tier of tiers) for (const s of tier) final.push(s.name);

  return {
    final,
    tiers: tiers.map((t) => t.map((s) => s.name)),
    seasons: seasonHistory,
    results: allResults,
  };
}
