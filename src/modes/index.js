import { Player } from "../core/Player.js";
import { STRATEGIES } from "../strategies/index.js";
import { startingBlobSide, placeStartingBlob } from "../core/startup.js";

const PALETTE = [
  { color: "#ff4d6d", accent: "#ff8fa3" },
  { color: "#3ea6ff", accent: "#8ecbff" },
  { color: "#a16bff", accent: "#cdb4ff" },
  { color: "#52e0a4", accent: "#a8f3d2" },
  { color: "#ffb84d", accent: "#ffd699" },
  { color: "#f97aff", accent: "#fbc2ff" },
  { color: "#ffe066", accent: "#fff3a3" },
  { content: "lime", color: "#7cffb2", accent: "#bbffd6" },
];

function makePlayer(i, strategy, name) {
  const p = PALETTE[i % PALETTE.length];
  return new Player({
    name: name ?? `P${i + 1}`,
    color: p.color,
    accent: p.accent,
    strategy,
    tech: strategy.tech,
  });
}

export const MODES = {
  classic: {
    name: "Classic",
    description: "Three rival civilizations clash on a wrapping plain.",
    setup(game) {
      const map = game.map;
      const players = [
        makePlayer(0, STRATEGIES.SlowAndSteady, "Steadfast"),
        makePlayer(1, STRATEGIES.Repel, "Repellent"),
        makePlayer(2, STRATEGIES.Trinity, "Trinity"),
      ];
      players.forEach((p) => game.addPlayer(p));
      const positions = [
        { x: Math.floor(map.width * 0.2), y: Math.floor(map.height * 0.5) },
        { x: Math.floor(map.width * 0.5), y: Math.floor(map.height * 0.2) },
        { x: Math.floor(map.width * 0.8), y: Math.floor(map.height * 0.7) },
      ];
      const side = startingBlobSide(map, players.length);
      positions.forEach((pos, i) => placeStartingBlob(game, players[i], pos.x, pos.y, side));
    },
    config: { width: 40, height: 30, growth: 1, maxArmy: 6, wrap: true },
  },

  arena: {
    name: "Arena",
    description: "Six AIs, tight quarters, fast metabolism. May the best heuristic win.",
    setup(game) {
      const strats = [
        STRATEGIES.SlowAndSteady,
        STRATEGIES.Repel,
        STRATEGIES.Trinity,
        STRATEGIES.Aggressive,
        STRATEGIES.Swarm,
        STRATEGIES.Berserker,
      ];
      const names = ["Steady", "Repel", "Trinity", "Aggro", "Swarm", "Berserk"];
      const map = game.map;
      const placements = strats.map((s, i) => {
        const p = makePlayer(i, s, names[i]);
        game.addPlayer(p);
        const angle = (i / strats.length) * Math.PI * 2;
        const cx = map.width / 2;
        const cy = map.height / 2;
        const r = Math.min(map.width, map.height) * 0.4;
        const x = Math.floor(cx + Math.cos(angle) * r);
        const y = Math.floor(cy + Math.sin(angle) * r);
        return { player: p, x, y };
      });
      const side = startingBlobSide(map, placements.length);
      for (const { player, x, y } of placements) placeStartingBlob(game, player, x, y, side);
    },
    config: { width: 30, height: 22, growth: 2, maxArmy: 6, wrap: true },
  },

  sandbox: {
    name: "Sandbox",
    description: "Empty world. Pick a player, click to spawn armies, swap strategies live.",
    setup(game) {
      const players = [
        makePlayer(0, STRATEGIES.SlowAndSteady, "Crimson"),
        makePlayer(1, STRATEGIES.Aggressive, "Azure"),
        makePlayer(2, STRATEGIES.Defender, "Violet"),
        makePlayer(3, STRATEGIES.Swarm, "Mint"),
      ];
      players.forEach((p) => game.addPlayer(p));
    },
    config: { width: 50, height: 36, growth: 0.8, maxArmy: 6, wrap: true },
  },
};
