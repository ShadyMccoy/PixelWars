// Glicko-style ratings + an information-gain matchmaker. Each bot has a
// rating (μ) and rating deviation (σ). After every match we update both;
// over many matches strong bots float up, weak bots sink, and σ shrinks
// for bots we've seen often. The matchmaker prefers lineups that are
// uncertain and close in skill — those produce the most information per
// match, which is the whole point of replacing the tier loop.
//
// Multi-player matches (K bots in a single arena) are decomposed into
// pairwise comparisons: each pair updates as if it were a head-to-head
// game, with the higher-ranked finisher counted as the winner.

const Q = Math.log(10) / 400;

export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const MIN_RD = 30;       // a bot we've seen a lot of still has a floor
export const MAX_RD = 350;      // never above the prior

export function newRating({ rating = DEFAULT_RATING, rd = DEFAULT_RD, played = 0 } = {}) {
  return { rating, rd, played };
}

function gFn(rd) {
  return 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));
}

function expected(r, rj, rdj) {
  return 1 / (1 + Math.pow(10, (-gFn(rdj) * (r - rj)) / 400));
}

// Apply one Glicko-1 rating period for `player` against `opponents`,
// where each opponent supplies { rating, rd, score } (score in [0,1]).
export function applyRatingPeriod(player, opponents) {
  if (opponents.length === 0) return player;
  let dInvSq = 0;
  let delta = 0;
  for (const op of opponents) {
    const E = expected(player.rating, op.rating, op.rd);
    const G = gFn(op.rd);
    dInvSq += G * G * E * (1 - E);
    delta += G * (op.score - E);
  }
  dInvSq *= Q * Q;
  const invRdSq = 1 / (player.rd * player.rd);
  const denom = invRdSq + dInvSq;
  const newRating = player.rating + (Q / denom) * delta;
  const newRd = clampRd(Math.sqrt(1 / denom));
  return {
    rating: newRating,
    rd: newRd,
    played: player.played + opponents.length,
  };
}

function clampRd(rd) {
  if (!Number.isFinite(rd)) return MAX_RD;
  return Math.max(MIN_RD, Math.min(MAX_RD, rd));
}

// Given a multi-player match's `ranking` (best to worst), produce a Map
// of name -> updated rating. Each bot is updated against every distinct
// other bot in the lineup using its read of the snapshot ratings (so all
// updates derive from the same pre-match state).
//
// Skips self-pairs when the same strategy name appears twice in the
// lineup — a bot can't gain information from beating itself.
export function pairwiseUpdates(ratings, ranking) {
  const updates = new Map();
  for (let i = 0; i < ranking.length; i++) {
    const me = ranking[i];
    const myRating = ratings.get(me.strategy);
    if (!myRating) continue;
    const opponents = [];
    for (let j = 0; j < ranking.length; j++) {
      if (i === j) continue;
      const opp = ranking[j];
      if (opp.strategy === me.strategy) continue;
      const oppR = ratings.get(opp.strategy);
      if (!oppR) continue;
      opponents.push({
        rating: oppR.rating,
        rd: oppR.rd,
        score: i < j ? 1 : 0,
      });
    }
    updates.set(me.strategy, applyRatingPeriod(myRating, opponents));
  }
  return updates;
}

// Pick K strategies for an informative match. Anchor on the bot with the
// highest current σ; fill the rest with peers whose ratings are closest
// to the anchor's, biased toward high σ (more uncertainty → more learning
// per match). A small RNG jitter keeps consecutive matches from picking
// the exact same lineup when σ ties.
export function pickInformativeLineup(strategies, ratings, k, rng) {
  const k_ = Math.min(k, strategies.length);
  if (k_ < 2) return strategies.slice(0, k_);

  const jitter = (scale) => (rng() - 0.5) * scale;

  // Anchor: highest σ wins. Tiebreak by jitter so we don't always pick
  // the same name.
  const anchor = strategies
    .slice()
    .sort((a, b) => {
      const ra = ratings.get(a.name);
      const rb = ratings.get(b.name);
      return (rb.rd + jitter(20)) - (ra.rd + jitter(20));
    })[0];

  const anchorR = ratings.get(anchor.name);

  // Partner score: low rating distance, high σ. Lower score = better.
  const partnerScore = (s) => {
    const r = ratings.get(s.name);
    const dist = Math.abs(r.rating - anchorR.rating);
    return dist - 0.6 * r.rd + jitter(80);
  };

  const partners = strategies
    .filter((s) => s !== anchor)
    .sort((a, b) => partnerScore(a) - partnerScore(b))
    .slice(0, k_ - 1);

  return [anchor, ...partners];
}

// Plain-object snapshot for serialization & cross-call seeding.
export function ratingsToObject(ratings) {
  const out = {};
  for (const [name, r] of ratings) {
    out[name] = { rating: +r.rating.toFixed(2), rd: +r.rd.toFixed(2), played: r.played };
  }
  return out;
}
