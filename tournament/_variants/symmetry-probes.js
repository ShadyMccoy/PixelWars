#!/usr/bin/env node
// Symmetry / map-size probes. The K=3 line layout is topologically
// symmetric on a wrapped torus, yet bit-for-bit the per-slot territory
// trajectories are unequal (slot 1 starts ~6 tiles behind, slot 2 wins
// long-term). This script isolates the cause by running pure mirror
// matches (every slot the same bot) on:
//   - 45x45 wrap K=3 line (original config)
//   - 30x22 wrap K=3 line (smaller, like lab1 with K=3)
//   - 24x18 wrap K=3 line (bracket1)
//   - 15x11 wrap K=3 line (very small)
//   - 45x45 wrap K=2 line (minimal symmetric case)
//   - 45x45 wrap K=4 line (4-fold symmetric)
//   - 45x45 NO-WRAP K=3 line (genuinely asymmetric: corners + middle)
// And on each, we run [A,A,...], [B,B,...], and [A,B,A] for comparison.

import { Game } from "../../src/core/Game.js";
import { Player } from "../../src/core/Player.js";
import { NEUTRAL_TECH } from "../../src/core/Tech.js";
import { startingBlobSide, placeStartingBlobs } from "../../src/core/startup.js";
import { getStrategy } from "../../src/strategies/index.js";

const A = getStrategy("Conqueror_g8_4d842b");
const B = getStrategy("Conqueror_g8_2c6b71");

const PALETTE = [
  { color: "#ff4d6d", accent: "#ff8fa3" },
  { color: "#3ea6ff", accent: "#8ecbff" },
  { color: "#a16bff", accent: "#cdb4ff" },
  { color: "#52e0a4", accent: "#a8f3d2" },
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

function runMirror(label, mapConfig, n, strategiesPerSlot) {
  const game = new Game({ ...mapConfig, seed: 88242417, maxHistory: 0 });
  const players = strategiesPerSlot.map((strat, i) => {
    const tech = strat.tech ? { ...NEUTRAL_TECH, ...strat.tech } : { ...NEUTRAL_TECH };
    const palette = PALETTE[i % PALETTE.length];
    const tag = strat === A ? "A" : strat === B ? "B" : strat.name.slice(0, 4);
    return {
      player: new Player({
        name: `${tag}@s${i}`,
        color: palette.color,
        accent: palette.accent,
        strategy: strat,
        tech,
      }),
      slotName: `${tag}@s${i}`,
    };
  });
  players.forEach(({ player }) => game.addPlayer(player));
  const positions = linePositions(n, mapConfig.width, mapConfig.height);
  const side = startingBlobSide(game.map, positions.length);
  placeStartingBlobs(game, players.map((p) => p.player), positions, side);

  const eliminated = new Map();
  let endReason = "max-ticks";
  const earlyTrack = []; // ticks 25, 50, 75, 100, 200
  while (game.tick < 4000) {
    game.step(1 / 30);
    const alive = new Set(game.livingPlayers().map((p) => p.id));
    for (const { player } of players) {
      if (!alive.has(player.id) && !eliminated.has(player.id)) {
        eliminated.set(player.id, game.tick);
      }
    }
    if ([25, 50, 75, 100, 200].includes(game.tick)) {
      game.recomputeTerritory();
      earlyTrack.push({
        tick: game.tick,
        per: players.map(({ player, slotName }) => ({
          slotName,
          terr: player.totals.territory,
        })),
      });
    }
    if (alive.size <= 1) {
      endReason = alive.size === 1 ? "winner" : "mutual-destruction";
      break;
    }
  }
  game.recomputeTerritory();

  const ranked = [...players].sort((a, b) => {
    const aSurv = !eliminated.has(a.player.id);
    const bSurv = !eliminated.has(b.player.id);
    if (aSurv !== bSurv) return bSurv ? 1 : -1;
    if (aSurv) {
      if (a.player.totals.territory !== b.player.totals.territory) {
        return b.player.totals.territory - a.player.totals.territory;
      }
      return b.player.totals.strength - a.player.totals.strength;
    }
    return (eliminated.get(b.player.id) ?? 0) - (eliminated.get(a.player.id) ?? 0);
  });

  const order = ranked.map((r) => {
    const elim = eliminated.get(r.player.id);
    return `${r.slotName}=${elim ?? `alive(t${r.player.totals.territory})`}`;
  }).join(" > ");
  console.log(`${label.padEnd(50)} | ${endReason} t=${game.tick} | ${order}`);

  // Show tick-25 territory split for the symmetry check.
  const t25 = earlyTrack.find((s) => s.tick === 25);
  if (t25) {
    const split = t25.per.map((p) => `${p.slotName}=${p.terr}`).join(", ");
    console.log(`${"".padEnd(50)} | tick25: ${split}`);
  }
  return { ranked, earlyTrack, ticks: game.tick };
}

const CONFIGS = [
  { label: "45x45 wrap K=3 line",   mc: { width: 45, height: 45, wrap: true,  growth: 1.2, maxArmy: 12 }, n: 3 },
  { label: "30x22 wrap K=3 line",   mc: { width: 30, height: 22, wrap: true,  growth: 1.2, maxArmy: 12 }, n: 3 },
  { label: "24x18 wrap K=3 line",   mc: { width: 24, height: 18, wrap: true,  growth: 1.2, maxArmy: 12 }, n: 3 },
  { label: "15x11 wrap K=3 line",   mc: { width: 15, height: 11, wrap: true,  growth: 1.2, maxArmy: 12 }, n: 3 },
  { label: "45x45 NO-WRAP K=3 line",mc: { width: 45, height: 45, wrap: false, growth: 1.2, maxArmy: 12 }, n: 3 },
  { label: "45x45 wrap K=2 line",   mc: { width: 45, height: 45, wrap: true,  growth: 1.2, maxArmy: 12 }, n: 2 },
  { label: "45x45 wrap K=4 line",   mc: { width: 45, height: 45, wrap: true,  growth: 1.2, maxArmy: 12 }, n: 4 },
];

for (const { label, mc, n } of CONFIGS) {
  console.log(`\n--- ${label} ---`);
  // Pure mirror with A.
  runMirror(`[A x${n}] mirror`, mc, n, Array(n).fill(A));
  // Pure mirror with B.
  runMirror(`[B x${n}] mirror`, mc, n, Array(n).fill(B));
  // K=3 only: include the H2H trio rotations.
  if (n === 3) {
    runMirror(`[B,A,A] rot0`, mc, n, [B, A, A]);
    runMirror(`[A,B,A] rot1`, mc, n, [A, B, A]);
    runMirror(`[A,A,B] rot2`, mc, n, [A, A, B]);
  }
  if (n === 2) {
    runMirror(`[A,B]`, mc, n, [A, B]);
    runMirror(`[B,A]`, mc, n, [B, A]);
  }
  if (n === 4) {
    runMirror(`[B,A,A,A]`, mc, n, [B, A, A, A]);
    runMirror(`[A,B,A,A]`, mc, n, [A, B, A, A]);
    runMirror(`[A,A,B,A]`, mc, n, [A, A, B, A]);
    runMirror(`[A,A,A,B]`, mc, n, [A, A, A, B]);
  }
}
