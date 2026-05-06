// Headless single-match runner. Returns a structured result with rankings.
import { Game } from "../src/core/Game.js";
import { Player } from "../src/core/Player.js";

const PALETTE = [
  { color: "#ff4d6d", accent: "#ff8fa3" },
  { color: "#3ea6ff", accent: "#8ecbff" },
  { color: "#a16bff", accent: "#cdb4ff" },
  { color: "#52e0a4", accent: "#a8f3d2" },
  { color: "#ffb84d", accent: "#ffd699" },
  { color: "#f97aff", accent: "#fbc2ff" },
  { color: "#ffe066", accent: "#fff3a3" },
  { color: "#7cffb2", accent: "#bbffd6" },
];

export function runMatch({
  strategies,
  mapConfig,
  startPositions,
  seed = 1,
  maxTicks = 4000,
  tickInterval = 1 / 30,
  snapshotEvery = 0,
}) {
  if (strategies.length !== startPositions.length) {
    throw new Error(`runMatch: ${strategies.length} strategies but ${startPositions.length} positions`);
  }

  const game = new Game({ ...mapConfig, seed, maxHistory: 0 });
  const players = strategies.map((s, i) => {
    const palette = PALETTE[i % PALETTE.length];
    return new Player({
      name: `${s.name}#${i + 1}`,
      color: palette.color,
      accent: palette.accent,
      strategy: s,
    });
  });
  players.forEach((p) => game.addPlayer(p));
  startPositions.forEach((pos, i) => {
    game.placeArmy({ x: pos.x, y: pos.y, player: players[i], strength: pos.strength ?? 1 });
  });

  const eliminated = new Map(); // playerId -> tick
  const snapshots = snapshotEvery > 0 ? [] : null;
  let endReason = "max-ticks";
  while (game.tick < maxTicks) {
    game.step(tickInterval);
    const alive = new Set(game.livingPlayers().map((p) => p.id));
    for (const p of players) {
      if (!alive.has(p.id) && !eliminated.has(p.id)) eliminated.set(p.id, game.tick);
    }
    if (snapshots && game.tick % snapshotEvery === 0) {
      game.recomputeTerritory();
      snapshots.push({
        tick: game.tick,
        perPlayer: players.map((p, slot) => ({
          slot,
          strategy: p.strategy.name,
          territory: p.totals.territory,
          strength: +p.totals.strength.toFixed(2),
          armies: p.totals.armies,
          alive: alive.has(p.id),
        })),
      });
    }
    if (alive.size <= 1) {
      endReason = alive.size === 1 ? "winner" : "mutual-destruction";
      break;
    }
  }

  // Territory totals are dirty-flagged during step(); refresh for the final
  // ranking.
  game.recomputeTerritory();

  // Ranking: late deaths beat early deaths; among survivors, more territory wins.
  const ranked = [...players].sort((a, b) => {
    const aDied = eliminated.get(a.id) ?? Infinity;
    const bDied = eliminated.get(b.id) ?? Infinity;
    if (aDied !== bDied) return bDied - aDied;
    if (a.totals.territory !== b.totals.territory) return b.totals.territory - a.totals.territory;
    return b.totals.strength - a.totals.strength;
  });

  const result = {
    seed,
    ticks: game.tick,
    endReason,
    ranking: ranked.map((p) => ({
      strategy: p.strategy.name,
      slot: players.indexOf(p),
      territory: p.totals.territory,
      strength: +p.totals.strength.toFixed(2),
      armies: p.totals.armies,
      eliminatedAt: eliminated.get(p.id) ?? null,
      survived: !eliminated.has(p.id),
    })),
  };
  if (snapshots) result.snapshots = snapshots;
  return result;
}
