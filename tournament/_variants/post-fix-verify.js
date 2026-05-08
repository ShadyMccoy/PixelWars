#!/usr/bin/env node
// Verify the engine fix (random army-iteration order in Game.step) by
// re-running the same probes as before but with vanilla Conqueror
// (no random tiebreak, no other changes).
//
//   K=2 [Conqueror, Conqueror] mirror across seeds: should be ~50/50.
//   K=6 [Conqueror, ...] mirror across seeds: slot-win distribution
//                                              should flatten.
//   K=6 URL config (4d842b@s1, 2c6b71@s3, ...) across seeds: this is
//                  the original observation. With the engine fix,
//                  outcomes should now vary by seed. If 2c6b71 still
//                  wins majority of seeds, the strategy edge is real;
//                  if win-rate is closer to 1/6 each, the H2H was
//                  100% the slot artifact.

import { Game } from "../../src/core/Game.js";
import { Player } from "../../src/core/Player.js";
import { NEUTRAL_TECH } from "../../src/core/Tech.js";
import { startingBlobSide, placeStartingBlobs } from "../../src/core/startup.js";
import { getStrategy } from "../../src/strategies/index.js";
import Conqueror from "../../src/strategies/Conqueror.js";

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

function runOne(strategiesPerSlot, mapConfig, positions, seed) {
  const game = new Game({ ...mapConfig, seed, maxHistory: 0 });
  const players = strategiesPerSlot.map((strat, i) => {
    const palette = PALETTE[i % PALETTE.length];
    const tech = strat.tech ? { ...NEUTRAL_TECH, ...strat.tech } : { ...NEUTRAL_TECH };
    return new Player({
      name: `${strat.name}#${i}`,
      color: palette.color,
      accent: palette.accent,
      strategy: strat,
      tech,
    });
  });
  players.forEach((p) => game.addPlayer(p));
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
  const winnerSlot = players.indexOf(ranked[0]);
  return { seed, ticks: game.tick, endReason, winnerSlot, ranked, players };
}

function distribute(label, strategiesPerSlot, mapConfig, positions, seedCount) {
  const n = strategiesPerSlot.length;
  const counts = new Array(n).fill(0);
  let totalTicks = 0;
  let stalemates = 0;
  for (let s = 0; s < seedCount; s++) {
    const r = runOne(strategiesPerSlot, mapConfig, positions, s + 1);
    counts[r.winnerSlot]++;
    totalTicks += r.ticks;
    if (r.endReason === "max-ticks") stalemates++;
  }
  console.log(`\n${label}  (${seedCount} seeds, avg ticks=${(totalTicks/seedCount).toFixed(0)}, stalemates=${stalemates})`);
  console.log("slot   wins   pct     vs_expected   strategy");
  const expected = seedCount / n;
  for (let i = 0; i < n; i++) {
    const pct = (counts[i] / seedCount * 100).toFixed(1);
    const vsExp = (counts[i] / expected).toFixed(2);
    console.log(`  s${i}  ${String(counts[i]).padStart(4)}   ${pct.padStart(5)}%   ${vsExp.padStart(5)}x       ${strategiesPerSlot[i].name}`);
  }
}

const MAP_45 = { width: 45, height: 45, growth: 1.2, maxArmy: 12, wrap: true };
const MAP_LAB1 = { width: 30, height: 22, growth: 1.8, maxArmy: 12, wrap: true };
const MAP_URL = { width: 45, height: 45, growth: 1.2, maxArmy: 12, wrap: true };

console.log("=== Mirror K=2 vanilla Conqueror, post-fix ===");
distribute(
  "K=2 mirror Conqueror 45x45",
  [Conqueror, Conqueror],
  MAP_45,
  linePositions(2, 45, 45),
  200,
);

console.log("\n=== Mirror K=6 vanilla Conqueror, post-fix ===");
distribute(
  "K=6 mirror Conqueror lab1",
  Array(6).fill(Conqueror),
  MAP_LAB1,
  linePositions(6, 30, 22),
  200,
);

console.log("\n=== URL config (4d842b@s1, 2c6b71@s3, ...) post-fix ===");
const URL_LINEUP = [
  { name: "Conqueror_g8_4d842b",  pos: { x: 11, y: 8  } },
  { name: "Conqueror_g10_e067cc", pos: { x: 34, y: 8  } },
  { name: "Conqueror_g8_2c6b71",  pos: { x: 11, y: 23 } },
  { name: "Conqueror_g6_15ea9a",  pos: { x: 34, y: 23 } },
  { name: "Conqueror_g2_6b59e8",  pos: { x: 11, y: 38 } },
  { name: "Conqueror_g9_c81d7f",  pos: { x: 34, y: 38 } },
];
distribute(
  "K=6 URL lineup, original positions",
  URL_LINEUP.map((u) => getStrategy(u.name)),
  MAP_URL,
  URL_LINEUP.map((u) => ({ ...u.pos, strength: 1 })),
  200,
);

console.log("\n=== Same lineup but swap 4d842b<->2c6b71 (positions swapped) ===");
const SWAPPED = [...URL_LINEUP];
SWAPPED[0] = { name: "Conqueror_g8_2c6b71",  pos: { x: 11, y: 8  } };
SWAPPED[2] = { name: "Conqueror_g8_4d842b",  pos: { x: 11, y: 23 } };
distribute(
  "K=6 URL lineup, 4d842b@s3 vs 2c6b71@s1",
  SWAPPED.map((u) => getStrategy(u.name)),
  MAP_URL,
  SWAPPED.map((u) => ({ ...u.pos, strength: 1 })),
  200,
);
