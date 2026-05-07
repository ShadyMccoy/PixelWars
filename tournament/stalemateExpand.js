// Stalemate handling for PL ranking input.
//
// At max-ticks with >1 player still alive, the strict territory-tiebreak
// ranking gave free 1st place to whichever survivor had marginally more
// land. That over-credited passive accumulators and under-credited bots
// that won most of their decisive matches.
//
// Fix: expand each stalemate match into N synthetic Plackett-Luce orderings
// drawn from each survivor's "naturalized share" of strength + territory.
// A 50/50 stalemate produces ~5 orderings each way → PL treats as a tie.
// A 99/1 stalemate produces ~9.9/10 orderings favoring the leader → PL
// treats as nearly a full win. Decisive matches still emit one ordering.
//
// Eliminated players keep their elimination-order tail; only survivors
// are sampled. Sampling RNG is seeded from the match seed so refits
// remain reproducible.

import { mulberry32 } from "../src/core/rng.js";

export const STALEMATE_SAMPLES = 10;

// A match name comes from r.name (matchLog format) or r.strategy
// (in-memory result format). Keep one accessor everywhere.
function entryName(r) {
  return r.name ?? r.strategy ?? r.entryName;
}

export function isStalemate(match) {
  if (match.endReason !== "max-ticks") return false;
  let alive = 0;
  for (const r of match.ranking) {
    if (r.survived) alive++;
    if (alive > 1) return true;
  }
  return false;
}

// Per-survivor share = average of normalized strength + normalized
// territory across the surviving block. Returns [{ name, share }, ...]
// for survivors only.
export function survivorShares(match) {
  const survivors = match.ranking.filter((r) => r.survived);
  let sumStrength = 0, sumTerritory = 0;
  for (const r of survivors) {
    sumStrength += r.strength || 0;
    sumTerritory += r.territory || 0;
  }
  return survivors.map((r) => {
    const sShare = sumStrength > 0 ? r.strength / sumStrength : 1 / survivors.length;
    const tShare = sumTerritory > 0 ? r.territory / sumTerritory : 1 / survivors.length;
    return { name: entryName(r), share: 0.5 * (sShare + tShare) };
  });
}

// One Plackett-Luce sample: pick first place with prob proportional to
// share, remove the picked entry, repeat until pool is empty.
function sampleOrdering(items, rng) {
  const pool = items.slice();
  const out = [];
  while (pool.length > 0) {
    let total = 0;
    for (const p of pool) total += p.share;
    if (total <= 0) {
      const idx = Math.floor(rng() * pool.length);
      out.push(pool[idx].name);
      pool.splice(idx, 1);
      continue;
    }
    let pick = rng() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      pick -= pool[i].share;
      if (pick <= 0) { idx = i; break; }
    }
    out.push(pool[idx].name);
    pool.splice(idx, 1);
  }
  return out;
}

// Returns { orderings, weights } suitable for fitPlackettLuce.
// Decisive matches contribute one ordering with weight 1. Stalemates
// contribute N orderings each with weight 1/N — so a stalemate's total
// PL evidence equals exactly one decisive match.
export function expandToOrderings(match, n = STALEMATE_SAMPLES) {
  if (!isStalemate(match)) {
    return { orderings: [match.ranking.map(entryName)], weights: [1] };
  }
  const eliminatedTail = match.ranking
    .filter((r) => !r.survived)
    .map(entryName);
  const shares = survivorShares(match);
  const seed = ((match.seed ?? 1) ^ 0xa1b2c3d4) >>> 0;
  const rng = mulberry32(seed);
  const orderings = new Array(n);
  const weights = new Array(n);
  for (let i = 0; i < n; i++) {
    orderings[i] = [...sampleOrdering(shares, rng), ...eliminatedTail];
    weights[i] = 1 / n;
  }
  return { orderings, weights };
}

// Convenience for callers that fit PL on a list of matches.
export function expandManyToOrderings(matches, n = STALEMATE_SAMPLES) {
  const orderings = [];
  const weights = [];
  for (const m of matches) {
    const r = expandToOrderings(m, n);
    for (let i = 0; i < r.orderings.length; i++) {
      orderings.push(r.orderings[i]);
      weights.push(r.weights[i]);
    }
  }
  return { orderings, weights };
}
