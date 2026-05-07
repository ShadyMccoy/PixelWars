// Headless single-match runner. Returns a structured result with rankings.
import { Game } from "../src/core/Game.js";
import { Player } from "../src/core/Player.js";
import { NEUTRAL_TECH, validateTech } from "../src/core/Tech.js";
import { startingBlobSide, placeStartingBlobs } from "../src/core/startup.js";

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
  // Treat as bare strategy. If the strategy ships with a default
  // character tech, use it; otherwise neutral.
  const tech = item.tech ? validateTech(item.tech) : { ...NEUTRAL_TECH };
  return { strategy: item, tech, name: item.name };
}

export function runMatch({
  strategies,
  mapConfig,
  startPositions,
  seed = 1,
  maxTicks = 4000,
  tickInterval = 1 / 30,
  snapshotEvery = 0,
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
  const side = startingBlobSide(game.map, startPositions.length);
  placeStartingBlobs(game, players, startPositions, side);

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

  // Ranking: survivors first, sorted by territory then strength. Eliminated
  // bots are all considered tied at the bottom — death-tick ordering used
  // to be the tiebreaker, which over-rewarded sit-still strategies (a
  // Pacifist that owned 0 tiles but died last finished above a builder
  // that died earlier with a real empire). PL/Borda treat the tail as
  // tied via stalemateExpand. Death-tick is still emitted in the result
  // for diagnostics and is used here only as a stable secondary sort
  // (latest-died is shown first within the tied tail).
  const ranked = [...players].sort((a, b) => {
    const aSurv = !eliminated.has(a.id);
    const bSurv = !eliminated.has(b.id);
    if (aSurv !== bSurv) return bSurv ? 1 : -1;
    if (aSurv) {
      if (a.totals.territory !== b.totals.territory) return b.totals.territory - a.totals.territory;
      return b.totals.strength - a.totals.strength;
    }
    return (eliminated.get(b.id) ?? 0) - (eliminated.get(a.id) ?? 0);
  });

  const survivorCount = ranked.length - eliminated.size;
  const stalemate = endReason === "max-ticks" && survivorCount > 1;
  const result = {
    seed,
    ticks: game.tick,
    endReason,
    stalemate,
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
  if (snapshots) result.snapshots = snapshots;
  return result;
}
