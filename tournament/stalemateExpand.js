// Tied-tier expansion for PL ranking input.
//
// Two kinds of ties get expanded into N synthetic Plackett-Luce orderings:
//
//   1. Stalemate survivor block (max-ticks with >1 player alive). Strict
//      territory-tiebreak gave free 1st place to whichever survivor had
//      marginally more land. Fix: each ordering samples 1st/2nd/... from
//      each survivor's "naturalized share" of strength + territory. A
//      50/50 stalemate produces ~5 orderings each way → PL treats as a
//      tie. A 99/1 stalemate produces ~9.9/10 orderings favoring the
//      leader.
//
//   2. Eliminated-bot tail (every match). Death-tick ordering used to
//      decide rank among the dead, which over-rewarded sit-still
//      strategies (a bot that owned 0 tiles but died last finished above
//      a builder that died earlier with a real empire). New rule: all
//      eliminated bots tie at the bottom; each ordering samples a
//      uniform random permutation of the dead.
//
// Decisive matches (1 survivor, 4000-tick non-stalemates) used to emit a
// single strict ordering. Now they emit N orderings each with weight 1/N
// — survivor fixed at top, dead bots in random order. PL aggregates to:
// "the survivor beat all dead, the dead are tied with each other."
//
// Sampling RNG is seeded from the match seed so refits remain reproducible.

import { mulberry32 } from "../src/core/rng.js";

export const STALEMATE_SAMPLES = 10;

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

// Fisher-Yates shuffle of a name array using the supplied rng.
function shuffleNames(names, rng) {
  const out = names.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Returns { orderings, weights } suitable for fitPlackettLuce. Every
// match emits N orderings each of weight 1/N — total evidence per match
// is exactly 1, regardless of whether the match was decisive, a
// stalemate, or mutual destruction.
export function expandToOrderings(match, n = STALEMATE_SAMPLES) {
  const survivors = match.ranking.filter((r) => r.survived);
  const eliminated = match.ranking.filter((r) => !r.survived).map(entryName);
  const seed = ((match.seed ?? 1) ^ 0xa1b2c3d4) >>> 0;
  const rng = mulberry32(seed);
  const stale = isStalemate(match);

  // Survivor head: stalemate samples by share; otherwise use the order
  // arena.js produced (territory-then-strength, deterministic).
  const survivorBlock = stale ? null : survivors.map(entryName);
  const shares = stale ? survivorShares(match) : null;

  const orderings = new Array(n);
  const weights = new Array(n);
  for (let i = 0; i < n; i++) {
    const head = stale ? sampleOrdering(shares, rng) : survivorBlock;
    const tail = eliminated.length > 1 ? shuffleNames(eliminated, rng) : eliminated;
    orderings[i] = [...head, ...tail];
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
