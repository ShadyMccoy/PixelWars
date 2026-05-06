import { sumStrength } from "../core/Army.js";

// Stencil5 layout: row-major over [-2..2] x [-2..2]; row index = y, col = x.
// Direction map (0=W, 1=E, 2=N, 3=S) for each of the 24 non-center cells.
const DIR_HINT = (() => {
  const out = new Array(25);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const dy = i - 2;
      const dx = j - 2;
      if (dx === 0 && dy === 0) {
        out[i * 5 + j] = -1;
        continue;
      }
      if (Math.abs(dx) >= Math.abs(dy)) out[i * 5 + j] = dx < 0 ? 0 : 1;
      else out[i * 5 + j] = dy < 0 ? 2 : 3;
    }
  }
  return out;
})();

export default {
  name: "Hunter",
  author: "core",
  version: 1,
  description: "Scans the 5x5 view, locks onto the nearest enemy, and pushes that direction.",
  summary: `Pursuit predator. Where SlowAndSteady only sees its four neighbors,
Hunter aggregates the whole 5x5 stencil into four directional votes,
each weighted by 1/distance so closer enemies dominate. Whatever
direction has the highest enemy mass wins, and we shove strength - 1
that way. Idea: empty buffer tiles between us and an enemy are wasted —
moving toward them now means we hit contact already at near-full
strength rather than dragging a half-built stack into a fight later.
Pairs poorly with itself (two Hunters spiral toward each other and
both die); shines against Cautious and Turtle, which sit at home
waiting to be found.`,
  act(army) {
    const tile = army.tile;
    if (!tile || !tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const votes = [0, 0, 0, 0];
    for (let i = 0; i < 25; i++) {
      const dir = DIR_HINT[i];
      if (dir < 0) continue;
      const t = stencil[i];
      if (!t) continue;
      const net = -sumStrength(t.armies, viewer); // positive = enemy presence
      if (net <= 0) continue;
      const dy = (i / 5) | 0;
      const dx = i - dy * 5;
      const dist = Math.abs(dx - 2) + Math.abs((dy | 0) - 2);
      votes[dir] += net / dist;
    }
    let bestDir = -1;
    let bestScore = 0;
    for (let d = 0; d < 4; d++) if (votes[d] > bestScore) {
      bestScore = votes[d];
      bestDir = d;
    }
    if (bestDir < 0) return;
    const target = tile.neighbors[bestDir];
    if (target) army.attack(target, army.attackPower);
  },
};
