// Mulberry32 — small fast deterministic PRNG.
// Returns a function that yields floats in [0, 1).
export function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  if (seed === null || seed === undefined) return Math.random;
  return mulberry32(seed);
}
