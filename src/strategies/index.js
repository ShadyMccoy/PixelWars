import { sumStrength, totalStrength } from "../core/Army.js";

function balanceAttack(army, tile) {
  const armies = tile.armies;
  if (armies.length > 0 && armies[0].player.id === army.player.id) {
    const enemyStrength = totalStrength(armies);
    army.attack(tile, army.strength - (army.strength + enemyStrength) / 2);
    return;
  }
  const enemy = totalStrength(armies);
  if (enemy + 1 < army.strength) {
    army.attack(tile, army.strength - 1);
  }
}

export function SlowAndSteady(army) {
  const tile = army.weakestAdjacent();
  if (!tile) return;
  balanceAttack(army, tile);
}

const REPEL_GRADIENT = [-2, 2, -2, 3];
export function Repel(army) {
  const tile = army.weakestAdjacent(REPEL_GRADIENT);
  if (!tile) return;
  balanceAttack(army, tile);
}

const TRINITY_KERNELS = [
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

// Precompute (stencilIdx, weight) tuples for each kernel, dropping zero entries.
// stencilIdx matches Tile.stencil5 layout: row-major over [-2..2] x [-2..2].
const TRINITY_OFFSETS = TRINITY_KERNELS.map((k) => {
  const out = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const w = k[i][j];
      if (w !== 0) out.push(i * 5 + j, w);
    }
  }
  return out;
});

export function Trinity(army, game) {
  const tile = army.tile;
  if (!tile) return;
  const stencil = tile.stencil5;
  const viewer = army.player;
  let bestDir = 0;
  let bestScore = -Infinity;
  for (let k = 0; k < 4; k++) {
    const offs = TRINITY_OFFSETS[k];
    let score = 0;
    for (let n = 0; n < offs.length; n += 2) {
      const t = stencil[offs[n]];
      if (!t) continue;
      score += offs[n + 1] * sumStrength(t.armies, viewer);
    }
    if (score > bestScore) {
      bestScore = score;
      bestDir = k;
    }
  }
  const target = tile.neighbors[bestDir];
  if (target) army.attack(target, army.strength - 1);
}

export function Aggressive(army, game) {
  const neighbors = army.tile ? army.tile.neighbors : null;
  const pid = army.player.id;
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 4; i++) {
    const t = neighbors ? neighbors[i] : game.map.adjacent(army.pos, i);
    if (!t) continue;
    const armies = t.armies;
    let enemyTotal = 0;
    let hasEnemy = false;
    for (let k = 0; k < armies.length; k++) {
      const a = armies[k];
      if (a.player.id !== pid) {
        enemyTotal += a.strength;
        hasEnemy = true;
      }
    }
    if (!hasEnemy) continue;
    if (enemyTotal > bestScore && enemyTotal < army.strength - 1) {
      bestScore = enemyTotal;
      best = t;
    }
  }
  if (best) army.attack(best, army.strength - 1);
  else SlowAndSteady(army, game);
}

export function Defender(army, game) {
  const neighbors = army.tile ? army.tile.neighbors : null;
  const pid = army.player.id;
  let friendliest = null;
  let count = 0;
  for (let i = 0; i < 4; i++) {
    const t = neighbors ? neighbors[i] : game.map.adjacent(army.pos, i);
    if (!t) continue;
    const armies = t.armies;
    let friendly = 0;
    for (let k = 0; k < armies.length; k++) {
      if (armies[k].player.id === pid) friendly++;
    }
    if (friendly > count) {
      count = friendly;
      friendliest = t;
    }
  }
  if (count > 0 && army.strength > 4) {
    army.attack(friendliest, army.strength * 0.5);
    return;
  }
  if (army.strength > army.maxStrength * 0.85) SlowAndSteady(army, game);
}

export function Random(army, game) {
  const dir = (Math.random() * 4) | 0;
  const tile = army.tile ? army.tile.neighbors[dir] : game.map.adjacent(army.pos, dir);
  if (!tile) return;
  army.attack(tile, Math.random() * (army.strength - 1));
}

export function Berserker(army, game) {
  if (army.strength < 2) return;
  const dir = (Math.random() * 4) | 0;
  const tile = army.tile ? army.tile.neighbors[dir] : game.map.adjacent(army.pos, dir);
  if (!tile) return;
  army.attack(tile, army.strength - 1);
}

export function Cautious(army, game) {
  if (army.strength < army.maxStrength * 0.7) return;
  SlowAndSteady(army, game);
}

export function Swarm(army, game) {
  const neighbors = army.tile ? army.tile.neighbors : null;
  const pid = army.player.id;
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < 4; i++) {
    const t = neighbors ? neighbors[i] : game.map.adjacent(army.pos, i);
    if (!t) continue;
    const armies = t.armies;
    let friendly = 0;
    let enemyS = 0;
    for (let k = 0; k < armies.length; k++) {
      const a = armies[k];
      if (a.player.id === pid) friendly++;
      else enemyS += a.strength;
    }
    const score = enemyS - friendly * 0.5;
    if (score < bestScore && enemyS < army.strength - 0.5) {
      bestScore = score;
      best = t;
    }
  }
  if (best) army.attack(best, Math.min(army.strength - 1, army.strength * 0.4 + 0.5));
}

export const STRATEGIES = {
  SlowAndSteady,
  Repel,
  Trinity,
  Aggressive,
  Defender,
  Random,
  Berserker,
  Cautious,
  Swarm,
};
