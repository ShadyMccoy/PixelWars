// Upset detection on a round-robin pairwise matrix.
//
// "Upset" = a pair whose observed head-to-head score is far from what
// the global rating predicts. We use the Elo formulation:
//   expected(A vs B) = 1 / (1 + 10^((rB - rA) / 400))
// which is equivalent to PL skill-ratio under the rating scaling used
// by tournament/rank.js (rating = 1000 + 400*log10(skill)).
//
// What counts as an upset:
//   - |observed - expected| ≥ deltaThreshold (default 0.20)
//   - games per pair ≥ minGames (default 5)
//   - the expected value is not in the Wilson 95% CI of the observed
//     score (so a 0.5 observation with games=2 isn't flagged as a
//     "0.30 upset" against a strong favorite)
//
// Output is sorted by absolute delta, descending — biggest surprises
// first. Each row carries enough context (ratings, observed score,
// CI, sample size) for a human or a downstream re-roll step to
// decide whether to dig in.

import { observedScoreA, scoreCI } from "./roundRobin.js";

export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// Coverage: does [ci.lo, ci.hi] contain the expected value? Used to
// suppress under-sampled "upsets" where the noise band still includes
// the prediction.
function ciContains(ci, value) {
  return value >= ci.lo && value <= ci.hi;
}

export function findUpsets(pairs, ratings, opts = {}) {
  const deltaThreshold = opts.deltaThreshold ?? 0.20;
  const minGames = opts.minGames ?? 5;
  const defaultRating = opts.defaultRating ?? 1000;
  const get = ratings?.get
    ? (n) => (ratings.has(n) ? ratings.get(n) : defaultRating)
    : () => defaultRating;

  const flagged = [];
  for (const stats of pairs.values()) {
    if (stats.games < minGames) continue;
    const ra = get(stats.a);
    const rb = get(stats.b);
    const exp = expectedScore(ra, rb);
    const obs = observedScoreA(stats);
    const delta = obs - exp;
    if (Math.abs(delta) < deltaThreshold) continue;
    const ci = scoreCI(stats);
    if (ciContains(ci, exp)) continue; // expected within noise — not a real upset
    flagged.push({
      a: stats.a,
      b: stats.b,
      ratingA: ra,
      ratingB: rb,
      games: stats.games,
      aWins: stats.aWins,
      bWins: stats.bWins,
      draws: stats.draws,
      observedA: +obs.toFixed(4),
      expectedA: +exp.toFixed(4),
      delta: +delta.toFixed(4),
      ci: { lo: +ci.lo.toFixed(4), hi: +ci.hi.toFixed(4) },
      stalemateRate: stats.games > 0
        ? +(stats.seeds.filter((s) => s.stalemate).length / stats.games).toFixed(3)
        : 0,
    });
  }
  flagged.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return flagged;
}

// Compare a pair's "before" stats to "after" stats from a re-roll and
// classify the upset:
//   - confirmed:   re-roll observed score is on the same side of
//                  expected as the original, by ≥ deltaThreshold
//   - reverted:    re-roll lands within deltaThreshold of expected
//   - amplified:   re-roll is even further from expected than original
//   - flipped:     re-roll lands on the opposite side of expected
// Caller passes the *combined* CI in case they want to merge before
// classifying; we don't merge automatically because the seed slices
// are independent and you may want to keep them separate.
export function classifyReroll(before, after, ratings, opts = {}) {
  const deltaThreshold = opts.deltaThreshold ?? 0.20;
  const defaultRating = opts.defaultRating ?? 1000;
  const get = ratings?.get
    ? (n) => (ratings.has(n) ? ratings.get(n) : defaultRating)
    : () => defaultRating;

  const ra = get(before.a);
  const rb = get(before.b);
  const exp = expectedScore(ra, rb);
  const obsBefore = observedScoreA(before);
  const obsAfter = observedScoreA(after);
  const dBefore = obsBefore - exp;
  const dAfter = obsAfter - exp;

  let kind;
  if (Math.sign(dBefore) !== Math.sign(dAfter) && Math.abs(dAfter) >= deltaThreshold) {
    kind = "flipped";
  } else if (Math.abs(dAfter) < deltaThreshold) {
    kind = "reverted";
  } else if (Math.abs(dAfter) > Math.abs(dBefore)) {
    kind = "amplified";
  } else {
    kind = "confirmed";
  }
  return {
    a: before.a,
    b: before.b,
    ratingA: ra,
    ratingB: rb,
    expectedA: +exp.toFixed(4),
    before: {
      games: before.games,
      observedA: +obsBefore.toFixed(4),
      delta: +dBefore.toFixed(4),
    },
    after: {
      games: after.games,
      observedA: +obsAfter.toFixed(4),
      delta: +dAfter.toFixed(4),
    },
    kind,
  };
}
