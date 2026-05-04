import { sumStrength, totalStrength } from "../core/Army.js";

function balanceAttack(army, tile) {
  const armies = tile.armies;
  if (armies.length > 0 && armies[0].player.equals(army.player)) {
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

export function Repel(army) {
  const gradient = [-2, 2, -2, 3];
  const tile = army.weakestAdjacent(gradient);
  if (!tile) return;
  balanceAttack(army, tile);
}

export function Trinity(army, game) {
  const inputs = [];
  for (let i = -2; i <= 2; i++) {
    const row = [];
    for (let j = -2; j <= 2; j++) {
      const tile = game.map.getTile(army.pos.x + j, army.pos.y + i);
      row.push(tile ? sumStrength(tile.armies, army.player) : 0);
    }
    inputs.push(row);
  }
  const kernels = [
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
  let bestDir = 0;
  let bestScore = -Infinity;
  for (let k = 0; k < 4; k++) {
    let score = 0;
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 5; j++) score += inputs[i][j] * kernels[k][i][j];
    if (score > bestScore) {
      bestScore = score;
      bestDir = k;
    }
  }
  const tile = game.map.adjacent(army.pos, bestDir);
  if (tile) army.attack(tile, army.strength - 1);
}

export function Aggressive(army, game) {
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 4; i++) {
    const t = game.map.adjacent(army.pos, i);
    if (!t) continue;
    const enemy = t.armies.filter((a) => !a.player.equals(army.player));
    if (enemy.length === 0) continue;
    const score = totalStrength(enemy);
    if (score > bestScore && score < army.strength - 1) {
      bestScore = score;
      best = t;
    }
  }
  if (best) army.attack(best, army.strength - 1);
  else SlowAndSteady(army, game);
}

export function Defender(army, game) {
  let friendliest = null;
  let count = 0;
  for (let i = 0; i < 4; i++) {
    const t = game.map.adjacent(army.pos, i);
    if (!t) continue;
    const friendly = t.armies.filter((a) => a.player.equals(army.player)).length;
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
  const dir = Math.floor(Math.random() * 4);
  const tile = game.map.adjacent(army.pos, dir);
  if (!tile) return;
  army.attack(tile, Math.random() * (army.strength - 1));
}

export function Berserker(army, game) {
  if (army.strength < 2) return;
  const dir = Math.floor(Math.random() * 4);
  const tile = game.map.adjacent(army.pos, dir);
  if (!tile) return;
  army.attack(tile, army.strength - 1);
}

export function Cautious(army, game) {
  if (army.strength < army.maxStrength * 0.7) return;
  SlowAndSteady(army, game);
}

export function Swarm(army, game) {
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < 4; i++) {
    const t = game.map.adjacent(army.pos, i);
    if (!t) continue;
    const friendly = t.armies.filter((a) => a.player.equals(army.player)).length;
    const enemy = t.armies.filter((a) => !a.player.equals(army.player));
    const enemyS = totalStrength(enemy);
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
