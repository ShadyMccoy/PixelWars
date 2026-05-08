// Tiny NN primitives for evolved bots. Float32Array throughout.
// Hot-path callers must pass pre-allocated output buffers — these
// helpers never allocate on the inner loop.
//
// Conventions:
//   - All matrices are flat row-major Float32Arrays.
//   - A weight matrix W of shape [K, N] maps a length-K input vector
//     to a length-N output vector via y[j] = sum_k x[k] * W[k*N + j].
//   - Genomes are stored in this same row-major layout, so a feature
//     index k and an output index d are at flat offset k*N + d.

// y = x · W. x is K-long, W is [K, N], y is N-long.
// Sparse-friendly: skips multiplication when x[k] is 0 (featurize zeros
// out empty cells, so most stencil channels are typically zero).
export function forward(x, W, y, K, N) {
  for (let j = 0; j < N; j++) y[j] = 0;
  for (let k = 0; k < K; k++) {
    const v = x[k];
    if (v === 0) continue;
    const wRow = k * N;
    for (let j = 0; j < N; j++) {
      y[j] += v * W[wRow + j];
    }
  }
}

// Y = X · W. X is [M, K], W is [K, N], Y is [M, N], all row-major.
// ikj loop order keeps the inner loop walking contiguous memory in
// both W and Y, which is by far the cheapest order in JS.
//
// Designed for batched single-layer evaluation across many armies —
// stack their feature vectors into rows of X, do one matmul, scatter
// directions out of Y. The per-army case (M=1) is just the degenerate
// batch and is identical to forward().
export function matmul(X, W, Y, M, K, N) {
  Y.fill(0);
  for (let i = 0; i < M; i++) {
    const xRow = i * K;
    const yRow = i * N;
    for (let k = 0; k < K; k++) {
      const v = X[xRow + k];
      if (v === 0) continue;
      const wRow = k * N;
      for (let j = 0; j < N; j++) {
        Y[yRow + j] += v * W[wRow + j];
      }
    }
  }
}

// Argmax over the first n entries of v. Ties go to the lowest index.
export function argmax(v, n) {
  let best = 0;
  let bestVal = v[0];
  for (let i = 1; i < n; i++) {
    if (v[i] > bestVal) {
      bestVal = v[i];
      best = i;
    }
  }
  return best;
}
