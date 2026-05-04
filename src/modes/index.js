import { Player } from "../core/Player.js";
import { STRATEGIES } from "../strategies/index.js";

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
      game.placeArmy({ x: Math.floor(map.width * 0.2), y: Math.floor(map.height * 0.5), player: players[0], strength: 1 });
      game.placeArmy({ x: Math.floor(map.width * 0.5), y: Math.floor(map.height * 0.2), player: players[1], strength: 1 });
      game.placeArmy({ x: Math.floor(map.width * 0.8), y: Math.floor(map.height * 0.7), player: players[2], strength: 1 });
    },
    config: { width: 40, height: 30, growth: 1, maxArmy: 10, wrap: true },
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
      strats.forEach((s, i) => {
        const p = makePlayer(i, s, names[i]);
        game.addPlayer(p);
        const angle = (i / strats.length) * Math.PI * 2;
        const cx = map.width / 2;
        const cy = map.height / 2;
        const r = Math.min(map.width, map.height) * 0.4;
        const x = Math.floor(cx + Math.cos(angle) * r);
        const y = Math.floor(cy + Math.sin(angle) * r);
        game.placeArmy({ x, y, player: p, strength: 2 });
      });
    },
    config: { width: 30, height: 22, growth: 2, maxArmy: 12, wrap: true },
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
    config: { width: 50, height: 36, growth: 0.8, maxArmy: 10, wrap: true },
  },

  royale: {
    name: "Battle Royale",
    description: "Eight contenders, no wrap. Last AI standing takes the crown.",
    setup(game) {
      const strats = [
        STRATEGIES.SlowAndSteady,
        STRATEGIES.Repel,
        STRATEGIES.Trinity,
        STRATEGIES.Aggressive,
        STRATEGIES.Defender,
        STRATEGIES.Swarm,
        STRATEGIES.Berserker,
        STRATEGIES.Cautious,
      ];
      const names = ["Steady", "Repel", "Trinity", "Aggro", "Defend", "Swarm", "Berserk", "Cautious"];
      const map = game.map;
      strats.forEach((s, i) => {
        const p = makePlayer(i, s, names[i]);
        game.addPlayer(p);
        const angle = (i / strats.length) * Math.PI * 2;
        const cx = map.width / 2;
        const cy = map.height / 2;
        const r = Math.min(map.width, map.height) * 0.45;
        const x = Math.max(1, Math.min(map.width - 2, Math.floor(cx + Math.cos(angle) * r)));
        const y = Math.max(1, Math.min(map.height - 2, Math.floor(cy + Math.sin(angle) * r)));
        game.placeArmy({ x, y, player: p, strength: 1 });
      });
    },
    config: { width: 44, height: 32, growth: 1.2, maxArmy: 10, wrap: false },
  },
};
