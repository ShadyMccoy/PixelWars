// Headless single-match runner. Returns a structured result with rankings.
import { Game } from "../src/core/Game.js";
import { Player } from "../src/core/Player.js";
import { NEUTRAL_TECH, validateTech } from "../src/core/Tech.js";

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

// Normalize a "lineup item" into { strategy, tech, name }. Items may be:
//   - a strategy object (legacy: { name, act })
//   - an entry object: { strategy, tech?, name? }
// Tech defaults to neutral; name defaults to strategy.name.
export function normalizeEntry(item) {
  if (item && typeof item === "object" && "strategy" in item) {
    const tech = item.tech ? validateTech(item.tech) : { ...NEUTRAL_TECH };
    return {
      strategy: item.strategy,
      tech,
      name: item.name ?? item.strategy.name,
    };
  }
  // Treat as bare strategy.
  return { strategy: item, tech: { ...NEUTRAL_TECH }, name: item.name };
}

export function runMatch({
  strategies,
  mapConfig,
  startPositions,
  seed = 1,
  maxTicks = 4000,
  tickInterval = 1 / 30,
}) {
  const entries = strategies.map(normalizeEntry);
  if (entries.length !== startPositions.length) {
    throw new Error(`runMatch: ${entries.length} entries but ${startPositions.length} positions`);
  }

  const game = new Game({ ...mapConfig, seed, maxHistory: 0 });
  const players = entries.map((e, i) => {
    const palette = PALETTE[i % PALETTE.length];
    return new Player({
      name: `${e.name}#${i + 1}`,
      color: palette.color,
      accent: palette.accent,
      strategy: e.strategy,
      tech: e.tech,
    });
  });
  players.forEach((p) => game.addPlayer(p));
  startPositions.forEach((pos, i) => {
    game.placeArmy({ x: pos.x, y: pos.y, player: players[i], strength: pos.strength ?? 1 });
  });

  const eliminated = new Map(); // playerId -> tick
  let endReason = "max-ticks";
  while (game.tick < maxTicks) {
    game.step(tickInterval);
    const alive = new Set(game.livingPlayers().map((p) => p.id));
    for (const p of players) {
      if (!alive.has(p.id) && !eliminated.has(p.id)) eliminated.set(p.id, game.tick);
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

  return {
    seed,
    ticks: game.tick,
    endReason,
    ranking: ranked.map((p) => {
      const idx = players.indexOf(p);
      return {
        strategy: p.strategy.name,
        entryName: entries[idx].name,
        tech: { ...entries[idx].tech },
        slot: idx,
        territory: p.totals.territory,
        strength: +p.totals.strength.toFixed(2),
        armies: p.totals.armies,
        eliminatedAt: eliminated.get(p.id) ?? null,
        survived: !eliminated.has(p.id),
      };
    }),
  };
}
