// Plackett-Luce skill estimation by minorization-maximization (Hunter 2004).
//
// Each match is an ordering of K players from best to worst. The PL model
// says: P(ordering) = ∏_{i=1..K-1} s_{π(i)} / Σ_{j=i..K} s_{π(j)}.
// Maximum-likelihood skills are found by the iterative MM update:
//
//   W_j     = # matches in which j appears in any non-last position
//   D_j     = Σ over (match m, position i ≤ K_m-2) such that j is at
//             position ≥ i in m, of  1 / Σ_{l=i..K_m-1} s_{π_m(l)}
//   s_j ←   W_j / D_j     (then renormalize so geometric mean = 1)
//
// The geometric-mean normalization is needed because PL skills are only
// identified up to a positive scale; renormalizing prevents drift to 0
// or ∞ across iterations.
//
// `opts.prior` adds a weak symmetric prior shrinking each bot's skill
// toward the population geometric mean. Equivalent to a phantom pair of
// virtual matches per bot against a reference opponent of skill 1: one
// won, one lost. Without it, a bot that wins (or loses) every match has
// an unbounded MLE skill and the iteration never converges. Default is
// 0.5 — strong enough to bound pathological cases, weak enough to barely
// move ratings once each bot has tens of real matches.

export function fitPlackettLuce(orderings, opts = {}) {
  const tol = opts.tol ?? 1e-7;
  const maxIter = opts.maxIter ?? 2000;
  const prior = opts.prior ?? 0.5;

  const nameSet = new Set();
  for (const o of orderings) for (const n of o) nameSet.add(n);
  const names = [...nameSet].sort();
  const idx = new Map(names.map((n, i) => [n, i]));
  const N = names.length;
  if (N === 0) return { skill: {}, iterations: 0, converged: true };

  // Encode orderings as integer arrays (best-first). Skip degenerate
  // matches (≤1 participant) — they carry no ranking signal.
  const matches = [];
  for (const o of orderings) {
    if (o.length < 2) continue;
    matches.push(o.map((n) => idx.get(n)));
  }

  // W[j] = appearances in non-last positions across all matches.
  const W = new Array(N).fill(0);
  for (const m of matches) {
    for (let i = 0; i < m.length - 1; i++) W[m[i]]++;
  }

  let s = new Array(N).fill(1);
  let converged = false;
  let iter = 0;

  for (; iter < maxIter; iter++) {
    const denom = new Array(N).fill(0);
    for (const m of matches) {
      const K = m.length;
      // T[i] = s[m[i]] + s[m[i+1]] + ... + s[m[K-1]]
      const T = new Array(K);
      let sum = 0;
      for (let i = K - 1; i >= 0; i--) {
        sum += s[m[i]];
        T[i] = sum;
      }
      for (let i = 0; i < K - 1; i++) {
        const inv = 1 / T[i];
        for (let l = i; l < K; l++) denom[m[l]] += inv;
      }
    }

    const sNew = new Array(N);
    for (let j = 0; j < N; j++) {
      // Prior contribution: one virtual win + one virtual loss against a
      // phantom of skill 1, each with weight `prior`. Adds `prior` to W_j
      // and 2 * prior / (s_j + 1) to D_j.
      const Wj = W[j] + prior;
      const Dj = denom[j] + (2 * prior) / (s[j] + 1);
      sNew[j] = Dj > 0 ? Wj / Dj : 1e-12;
      if (!isFinite(sNew[j]) || sNew[j] <= 0) sNew[j] = 1e-12;
    }

    let logSum = 0;
    for (let j = 0; j < N; j++) logSum += Math.log(sNew[j]);
    const geo = Math.exp(logSum / N);
    for (let j = 0; j < N; j++) sNew[j] /= geo;

    let maxRel = 0;
    for (let j = 0; j < N; j++) {
      const rel = Math.abs(sNew[j] - s[j]) / Math.max(s[j], 1e-12);
      if (rel > maxRel) maxRel = rel;
    }
    s = sNew;
    if (maxRel < tol) { converged = true; break; }
  }

  const skill = {};
  for (let j = 0; j < N; j++) skill[names[j]] = s[j];
  return { skill, iterations: iter + 1, converged };
}
