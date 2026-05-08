#!/usr/bin/env node
// Test: does randomizing Conqueror's cardinal-direction tiebreak
// eliminate (or reduce) the slot bias?
//
// Step A: K=2 vanilla Conqueror mirror (baseline). Should show s0 wins.
// Step B: K=2 Conqueror_rand mirror across many seeds. If the W-bias
//         is the cause, s0/s1 win-rate should approach 50/50 once the
//         bias is removed and only sampling noise from game.rng()
//         remains.
// Step C: K=6 lab1 (30x22 wrap K=6) Conqueror_rand mirror across seeds.
//         If the second-hot-slot pattern (slot 3) is also caused by
//         W-bias compounding, randomization should flatten it.

import { Game } from "../../src/core/Game.js";
import { Player } from "../../src/core/Player.js";
import { NEUTRAL_TECH } from "../../src/core/Tech.js";
import { startingBlobSide, placeStartingBlobs } from "../../src/core/startup.js";
import Conqueror from "../../src/strategies/Conqueror.js";
import Conqueror_rand from "./conqueror-rand.js";

const PALETTE = [
  { color: "#ff4d6d", accent: "#ff8fa3" },
  { color: "#3ea6ff", accent: "#8ecbff" },
  { color: "#a16bff", accent: "#cdb4ff" },
  { color: "#52e0a4", accent: "#a8f3d2" },
  { color: "#ffb84d", accent: "#ffd699" },
  { color: "#f97aff", accent: "#fbc2ff" },
];

function linePositions(n, width, height) {
  const y = Math.floor(height / 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? Math.floor(width / 2) : Math.round(width * (i + 0.5) / n) % width;
    out.push({ x, y, strength: 1 });
  }
  return out;
}

function runOne(strategy, mapConfig, n, seed) {
  const game = new Game({ ...mapConfig, seed, maxHistory: 0 });
  const players = [];
  for (let i = 0; i < n; i++) {
    const palette = PALETTE[i % PALETTE.length];
    players.push(new Player({
      name: `s${i}`,
      color: palette.color,
      accent: palette.accent,
      strategy,
      tech: { ...NEUTRAL_TECH },
    }));
  }
  players.forEach((p) => game.addPlayer(p));
  const positions = linePositions(n, mapConfig.width, mapConfig.height);
  const side = startingBlobSide(game.map, positions.length);
  placeStartingBlobs(game, players, positions, side);

  const eliminated = new Map();
  let endReason = "max-ticks";
  while (game.tick < 4000) {
    game.step(1 / 30);
    const alive = new Set(game.livingPlayers().map((p) => p.id));
    for (const p of players) {
      if (!alive.has(p.id) && !eliminated.has(p.id)) eliminated.set(p.id, game.tick);
    }
    if (alive.size <= 1) {
      endReason = alive.size === 1 ? "winner" : "mutual-destruction";
      break;
    }
  }
  game.recomputeTerritory();

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
  const winner = ranked[0];
  const winnerSlot = players.indexOf(winner);
  const survivorCount = players.length - eliminated.size;
  return { seed, ticks: game.tick, endReason, winnerSlot, survivorCount };
}

function distribute(strategy, mapConfig, n, seeds, label) {
  const counts = new Array(n).fill(0);
  let stalemates = 0;
  let totalTicks = 0;
  for (let s = 0; s < seeds; s++) {
    const r = runOne(strategy, mapConfig, n, s + 1);
    if (r.survivorCount > 1 && r.endReason === "max-ticks") stalemates++;
    counts[r.winnerSlot]++;
    totalTicks += r.ticks;
  }
  const expected = seeds / n;
  console.log(`\n${label}  (${seeds} seeds, avg ticks=${(totalTicks/seeds).toFixed(0)}, stalemates=${stalemates})`);
  console.log("slot   wins   pct     vs_expected");
  for (let i = 0; i < n; i++) {
    const pct = (counts[i] / seeds * 100).toFixed(1);
    const vsExp = (counts[i] / expected).toFixed(2);
    console.log(`  s${i}  ${String(counts[i]).padStart(4)}   ${pct.padStart(5)}%  ${vsExp.padStart(5)}x`);
  }
}

const MAP_45_K2 = { width: 45, height: 45, growth: 1.2, maxArmy: 12, wrap: true };
const MAP_LAB1  = { width: 30, height: 22, growth: 1.8, maxArmy: 12, wrap: true };

console.log("=== A: K=2 vanilla Conqueror baseline (5 seeds) ===");
distribute(Conqueror,      MAP_45_K2,   2, 5,  "vanilla Conqueror K=2 45x45 wrap");

console.log("\n=== B: K=2 Conqueror_rand (50 seeds) ===");
distribute(Conqueror_rand, MAP_45_K2,   2, 50, "Conqueror_rand K=2 45x45 wrap");

console.log("\n=== C: K=2 Conqueror_rand (200 seeds, tighter CI) ===");
distribute(Conqueror_rand, MAP_45_K2,   2, 200, "Conqueror_rand K=2 45x45 wrap");

console.log("\n=== D: K=6 vanilla Conqueror lab1 baseline (5 seeds) ===");
distribute(Conqueror,      MAP_LAB1,    6, 5,  "vanilla Conqueror K=6 lab1");

console.log("\n=== E: K=6 Conqueror_rand lab1 (100 seeds) ===");
distribute(Conqueror_rand, MAP_LAB1,    6, 100, "Conqueror_rand K=6 lab1");
