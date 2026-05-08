#!/usr/bin/env node
// Probe 2: does B (2c6b71) win against two copies of A (4d842b) in K=3?
// And does the answer depend on B's position?
//
// Map: 45x45 wrap g=1.2 m=12 (URL config).
// K=3 line layout: 3 evenly spaced positions on the wrap line at y=H/2.
// All three positions are topologically symmetric on a wrap line, so
// rotation tests primarily probe the placeStartingBlobs tie-hash + any
// player-index dependent ordering in step.
//
// We run 3 rotations: [B,A,A], [A,B,A], [A,A,B]. Snapshots every 25
// ticks for the neutral-grab follow-up.

import { Game } from "../../src/core/Game.js";
import { Player } from "../../src/core/Player.js";
import { NEUTRAL_TECH } from "../../src/core/Tech.js";
import { startingBlobSide, placeStartingBlobs } from "../../src/core/startup.js";
import { getStrategy } from "../../src/strategies/index.js";

const MAP = { width: 45, height: 45, growth: 1.2, maxArmy: 12, wrap: true };

const A = getStrategy("Conqueror_g8_4d842b");
const B = getStrategy("Conqueror_g8_2c6b71");

// K=3 line layout copied from tournament/maps.js linePositions(3, ...).
function k3LinePositions(width, height) {
  const y = Math.floor(height / 2);
  const out = [];
  for (let i = 0; i < 3; i++) {
    const x = Math.round(width * (i + 0.5) / 3) % width;
    out.push({ x, y, strength: 1 });
  }
  return out;
}

const POS = k3LinePositions(MAP.width, MAP.height);
console.log(`K=3 line positions: ${POS.map((p) => `(${p.x},${p.y})`).join(", ")}`);

const PALETTE = [
  { color: "#ff4d6d", accent: "#ff8fa3" },
  { color: "#3ea6ff", accent: "#8ecbff" },
  { color: "#a16bff", accent: "#cdb4ff" },
];

function runOne(strategiesBySlot, label) {
  const game = new Game({ ...MAP, seed: 88242417, maxHistory: 0 });
  const players = strategiesBySlot.map((strat, i) => {
    const tech = strat.tech ? { ...NEUTRAL_TECH, ...strat.tech } : { ...NEUTRAL_TECH };
    const palette = PALETTE[i % PALETTE.length];
    const tag = strat.name === "Conqueror_g8_4d842b" ? "A" : "B";
    const slotName = `${tag}@s${i}`;
    return {
      player: new Player({
        name: slotName,
        color: palette.color,
        accent: palette.accent,
        strategy: strat,
        tech,
      }),
      slotName,
    };
  });
  players.forEach(({ player }) => game.addPlayer(player));
  const positions = POS.map((p) => ({ x: p.x, y: p.y, strength: 1 }));
  const side = startingBlobSide(game.map, positions.length);
  placeStartingBlobs(game, players.map((p) => p.player), positions, side);

  const eliminated = new Map();
  const snapshots = [];
  let endReason = "max-ticks";
  while (game.tick < 4000) {
    game.step(1 / 30);
    const alive = new Set(game.livingPlayers().map((p) => p.id));
    for (const { player } of players) {
      if (!alive.has(player.id) && !eliminated.has(player.id)) {
        eliminated.set(player.id, game.tick);
      }
    }
    if (game.tick % 25 === 0) {
      game.recomputeTerritory();
      snapshots.push({
        tick: game.tick,
        per: players.map(({ player, slotName }) => ({
          slotName,
          terr: player.totals.territory,
          alive: alive.has(player.id),
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

  console.log(`\n=== ${label} | ticks=${game.tick} ${endReason} ===`);
  for (let i = 0; i < ranked.length; i++) {
    const { player, slotName } = ranked[i];
    const elim = eliminated.get(player.id);
    console.log(
      `  #${i + 1} ${slotName.padEnd(6)} terr=${String(player.totals.territory).padStart(4)} elim=${elim ?? "alive"}`,
    );
  }
  return { label, ranked, snapshots, ticks: game.tick };
}

// Three rotations.
const r0 = runOne([B, A, A], "rot0: [B,A,A] (B at slot 0)");
const r1 = runOne([A, B, A], "rot1: [A,B,A] (B at slot 1)");
const r2 = runOne([A, A, B], "rot2: [A,A,B] (B at slot 2)");

// Pull early-game (tick <= 200) snapshots for the neutral-grab probe.
console.log("\n=== Early-game (neutral-grab) territory by rotation ===");
for (const r of [r0, r1, r2]) {
  console.log(`\n${r.label}`);
  console.log("tick\t" + r.snapshots[0].per.map((p) => p.slotName).join("\t"));
  for (const s of r.snapshots.slice(0, 8)) { // first 200 ticks (8 * 25)
    console.log(s.tick + "\t" + s.per.map((p) => (p.alive ? p.terr : "DEAD")).join("\t"));
  }
}

// Summary verdict for the strategy-vs-position question.
console.log("\n=== Verdict ===");
for (const r of [r0, r1, r2]) {
  const winner = r.ranked[0].slotName;
  console.log(`  ${r.label}: winner=${winner}`);
}
