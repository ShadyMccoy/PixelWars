import { sumStrength } from "../core/Army.js";

const KERNELS = [
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
];

const OFFSETS = KERNELS.map((k) => {
  const out = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const w = k[i][j];
      if (w !== 0) out.push(i * 5 + j, w);
    }
  }
  return out;
});

// Two cells in front of the army for each direction, in stencil5 indices.
// Direction order matches tile.neighbors: 0=W, 1=E, 2=N, 3=S.
const FORWARD = [
  [11, 10],
  [13, 14],
  [7, 2],
  [17, 22],
];

const ENEMY_WEIGHT = 1;

function enemyStrength(armies, viewer) {
  const vid = viewer.id;
  let s = 0;
  for (let i = 0; i < armies.length; i++) {
    const a = armies[i];
    if (a.player.id !== vid) s += a.strength;
  }
  return s;
}

export default {
  name: "Lance",
  author: "core",
  version: 1,
  description: "Trinity's flocking plus a forward-cell enemy attractor — flock and aim at the throat.",
  summary: `A Trinity variant that closes Trinity's blind spot. Trinity's
kernels score flank and rear cells but never look at the two cells
directly ahead, so an army that's well-flocked will happily march
into empty space. Lance keeps Trinity's alignment score unchanged
and adds a separate term: enemy mass in the two forward cells of
each candidate direction. Friendly alignment still dominates when
allies are clearly to one side, but ties (and near-ties) break
toward the direction with enemies in front. The result is flocking
that prefers to form lines aimed at the opponent rather than lines
aimed at vacuum.`,
  act(army) {
    const tile = army.tile;
    if (!tile) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    let bestDir = 0;
    let bestScore = -Infinity;
    for (let k = 0; k < 4; k++) {
      const offs = OFFSETS[k];
      let score = 0;
      for (let n = 0; n < offs.length; n += 2) {
        const t = stencil[offs[n]];
        if (!t) continue;
        score += offs[n + 1] * sumStrength(t.armies, viewer);
      }
      const fwd = FORWARD[k];
      for (let n = 0; n < fwd.length; n++) {
        const t = stencil[fwd[n]];
        if (!t) continue;
        score += ENEMY_WEIGHT * enemyStrength(t.armies, viewer);
      }
      if (score > bestScore) {
        bestScore = score;
        bestDir = k;
      }
    }
    const target = tile.neighbors[bestDir];
    if (target) army.attack(target, army.attackPower);
  },
};
