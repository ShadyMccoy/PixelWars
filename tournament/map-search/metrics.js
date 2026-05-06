// Statistical helpers for the map-search evaluator.
//
//   predictRanking(snapshot) — "if the match ended now, how would it rank?"
//   tStable(snapshots, finalRanking) — earliest tick where mid-match prediction
//                                      converges on the actual final ranking.
//   spearman(rankA, rankB)         — rank correlation in [-1, 1].

// Order players from a snapshot the same way arena.js does at end-of-match:
// living before dead, dead by elimination time desc, ties broken by territory
// then strength. Mid-match snapshots don't carry eliminatedAt, but we have
// `alive` and territory; treat any non-alive at this snapshot as already dead
// and break ties on territory desc, strength desc.
export function predictRanking(snapshot) {
  const ordered = [...snapshot.perPlayer].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (a.territory !== b.territory) return b.territory - a.territory;
    return b.strength - a.strength;
  });
  // Returns array of slot indices, best first.
  return ordered.map((p) => p.slot);
}

// Convert an ordering [slotA, slotB, ...] into a rank vector indexed by slot:
// rank[slot] = 0 for the best, 1 for second, etc.
export function ordersToRanks(order, n) {
  const ranks = new Array(n);
  for (let i = 0; i < order.length; i++) ranks[order[i]] = i;
  return ranks;
}

// Spearman rank correlation between two rank vectors of equal length.
// Returns 1.0 for identical ordering, -1.0 for reverse, 0 for unrelated.
// Both inputs must be rank vectors (i.e. ordersToRanks output) over the same
// set of slots.
export function spearman(rankA, rankB) {
  const n = rankA.length;
  if (n !== rankB.length) throw new Error(`spearman: length mismatch ${n} vs ${rankB.length}`);
  if (n < 2) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = rankA[i] - rankB[i];
    sum += d * d;
  }
  return 1 - (6 * sum) / (n * (n * n - 1));
}

// Find earliest snapshot tick where Spearman correlation between the
// mid-match predicted ranking and the final ranking is >= threshold and
// remains >= threshold for the rest of the match. If never, returns
// finalTick (i.e. the whole match was needed).
//
// finalRankingSlots: array of slot indices in final ranking order.
export function tStable(snapshots, finalRankingSlots, finalTick, threshold = 0.9) {
  if (!snapshots || snapshots.length === 0) return finalTick;
  const n = finalRankingSlots.length;
  const finalRanks = ordersToRanks(finalRankingSlots, n);

  // Walk backwards: find the latest tick where correlation drops below
  // threshold; t_stable is the next snapshot after that.
  let lastBad = -1;
  for (let i = 0; i < snapshots.length; i++) {
    const predOrder = predictRanking(snapshots[i]);
    const predRanks = ordersToRanks(predOrder, n);
    const r = spearman(predRanks, finalRanks);
    if (r < threshold) lastBad = i;
  }
  if (lastBad === -1) return snapshots[0].tick;
  if (lastBad === snapshots.length - 1) return finalTick;
  return snapshots[lastBad + 1].tick;
}

// ---------- aggregate-ranking metrics (used by Phase 4) ----------

// Convert per-bot win-rate (or any score) into a rank vector keyed by name.
// Ties get averaged ranks so Spearman is well-defined on ties.
export function scoresToRanks(scoresByName) {
  const entries = Object.entries(scoresByName);
  entries.sort((a, b) => b[1] - a[1]); // higher score = lower rank index
  const ranks = {};
  let i = 0;
  while (i < entries.length) {
    let j = i;
    while (j + 1 < entries.length && entries[j + 1][1] === entries[i][1]) j++;
    const avg = (i + j) / 2;
    for (let k = i; k <= j; k++) ranks[entries[k][0]] = avg;
    i = j + 1;
  }
  return ranks;
}

// Re-rank an array of values into 0-based ranks (smaller value → smaller
// rank). Ties get averaged ranks so a rank correlation handles ties
// properly.
function denseRank(values) {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((x, y) => x.v - y.v);
  const out = new Array(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avg = (i + j) / 2;
    for (let k = i; k <= j; k++) out[indexed[k].i] = avg;
    i = j + 1;
  }
  return out;
}

// Spearman correlation between two rank-by-name dictionaries on their
// shared set of names. The input "ranks" may come from larger pools (so
// they aren't dense over the shared set); we re-rank within the shared
// subset before correlating, which is the correct way to handle ties
// and partial overlap. Returns 0 if the shared set has < 2 elements.
export function spearmanByName(ranksA, ranksB) {
  const names = Object.keys(ranksA).filter((n) => n in ranksB);
  if (names.length < 2) return 0;
  const a = denseRank(names.map((n) => ranksA[n]));
  const b = denseRank(names.map((n) => ranksB[n]));
  // Pearson correlation on rank vectors — equivalent to Spearman, and
  // the closed-form 1 - 6Σd²/(n(n²-1)) breaks under ties, so we use
  // Pearson directly.
  const n = a.length;
  let meanA = 0, meanB = 0;
  for (let i = 0; i < n; i++) { meanA += a[i]; meanB += b[i]; }
  meanA /= n; meanB /= n;
  let num = 0, dA = 0, dB = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - meanA, xb = b[i] - meanB;
    num += xa * xb; dA += xa * xa; dB += xb * xb;
  }
  if (dA === 0 || dB === 0) return 0;
  return num / Math.sqrt(dA * dB);
}

// Fraction of explicit pairwise dominance claims that a ranking gets right.
// pairs: [[winnerName, loserName], ...]
// ranksByName: { name: rank } where lower = better.
// Pairs missing from ranks are skipped.
export function pairAccuracy(pairs, ranksByName) {
  let total = 0;
  let correct = 0;
  for (const [winner, loser] of pairs) {
    if (!(winner in ranksByName) || !(loser in ranksByName)) continue;
    total++;
    if (ranksByName[winner] < ranksByName[loser]) correct++;
  }
  return total === 0 ? null : correct / total;
}
