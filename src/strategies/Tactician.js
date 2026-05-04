import { sumStrength } from "../core/Army.js";

// For each cardinal direction, score the half-plane the move would expose us to.
const HALF_PLANES = [
  // West: cells with dx <= -1 weighted toward the move axis
  [],
  [], // East
  [],
  [], // South
];
for (let i = 0; i < 5; i++) {
  for (let j = 0; j < 5; j++) {
    const dy = i - 2;
    const dx = j - 2;
    if (dx === 0 && dy === 0) continue;
    const idx = i * 5 + j;
    const dist = Math.abs(dx) + Math.abs(dy);
    const w = 1 / dist;
    if (dx <= -1) HALF_PLANES[0].push(idx, w);
    if (dx >= 1) HALF_PLANES[1].push(idx, w);
    if (dy <= -1) HALF_PLANES[2].push(idx, w);
    if (dy >= 1) HALF_PLANES[3].push(idx, w);
  }
}

export default {
  name: "Tactician",
  author: "core",
  version: 1,
  description: "Picks the direction whose half of the 5x5 view has the best friendly-vs-enemy net.",
  act(army) {
    const tile = army.tile;
    if (!tile || !tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    let bestDir = -1;
    let bestScore = -Infinity;
    for (let d = 0; d < 4; d++) {
      const target = tile.neighbors[d];
      if (!target) continue;
      const offs = HALF_PLANES[d];
      let score = 0;
      for (let n = 0; n < offs.length; n += 2) {
        const t = stencil[offs[n]];
        if (!t) continue;
        score += offs[n + 1] * sumStrength(t.armies, viewer);
      }
      if (score > bestScore) {
        bestScore = score;
        bestDir = d;
      }
    }
    if (bestDir < 0) return;
    const target = tile.neighbors[bestDir];
    const armies = target.armies;
    let enemy = 0;
    const pid = army.player.id;
    for (let k = 0; k < armies.length; k++) {
      const a = armies[k];
      if (a.player.id !== pid) enemy += a.strength;
    }
    const power = Math.min(army.strength - 1, enemy + 1.5 + army.strength * 0.25);
    if (power > 0.5) army.attack(target, power);
  },
};
