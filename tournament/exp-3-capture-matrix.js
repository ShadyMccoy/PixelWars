#!/usr/bin/env node
// K=3 detailed capture-matrix harness.
//
// At K=3 (and K=6) on the user's 45x45 wrap map, B always beats A.
// This script runs K=3 matches at multiple seeds and tracks tile
// ownership over time, computing per-pair capture matrices: how many
// tiles X took from Y (and vice versa) across each match.
//
// Mechanics: between snapshots we diff the per-tile owner array.
// Captures(X,Y) += 1 for every tile that flipped from Y to X.
// Aggregated per match and per seed-set.
//
// (No bot source-code peek. Engine internals are fair game.)

import { Game } from "../src/core/Game.js";
import { Player } from "../src/core/Player.js";
import { NEUTRAL_TECH, validateTech } from "../src/core/Tech.js";
import { startingBlobSide, placeStartingBlobs } from "../src/core/startup.js";
import { getStrategy } from "../src/strategies/index.js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const A = "Conqueror_g8_4d842b";
const B = "Conqueror_g8_2c6b71";
const C = "Conqueror_g10_e067cc"; // the filler bot from BASE_LINEUP[1]
const NAMES = [A, B, C];
const MAP = { width: 45, height: 45, growth: 1.2, maxArmy: 12, wrap: true };
const POSITIONS = [
  { x: 11, y:  8, strength: 1 },
  { x: 34, y: 23, strength: 1 },
  { x: 11, y: 38, strength: 1 },
];
const FIXED_SEED = 88242417;
const N_SEEDS = 15;
const SNAPSHOT_EVERY = 25; // ticks per snapshot

const PALETTE = [
  { color: "#ff4d6d", accent: "#ff8fa3" },
  { color: "#3ea6ff", accent: "#8ecbff" },
  { color: "#a16bff", accent: "#cdb4ff" },
];

function snapshotOwners(game) {
  const tiles = game.map.tiles;
  const out = new Int8Array(tiles.length);
  for (let i = 0; i < tiles.length; i++) {
    const armies = tiles[i].armies;
    out[i] = armies.length > 0 ? armies[0].player.id : -1;
  }
  return out;
}

function diffCaptures(prev, cur, idToSlot) {
  // Returns captures[gainer_slot][loser_slot] += 1 (slot = lineup index).
  // Also returns gain_from_neutral[slot] for tiles flipped from -1.
  const N = idToSlot.size;
  const m = Array.from({ length: N }, () => new Array(N).fill(0));
  const fromNeutral = new Array(N).fill(0);
  const toNeutral = new Array(N).fill(0);
  for (let i = 0; i < cur.length; i++) {
    if (cur[i] === prev[i]) continue;
    const ps = prev[i] === -1 ? -1 : idToSlot.get(prev[i]);
    const cs = cur[i] === -1 ? -1 : idToSlot.get(cur[i]);
    if (cs === -1) {
      if (ps !== -1) toNeutral[ps]++;
    } else if (ps === -1) {
      fromNeutral[cs]++;
    } else if (ps !== cs) {
      m[cs][ps]++;
    }
  }
  return { captures: m, fromNeutral, toNeutral };
}

function runOne(lineup, positions, seed) {
  const strategies = lineup.map((n) => getStrategy(n));
  const game = new Game({ ...MAP, seed, maxHistory: 0 });
  const players = strategies.map((s, i) => {
    const palette = PALETTE[i % PALETTE.length];
    const tech = s.tech ? validateTech(s.tech) : { ...NEUTRAL_TECH };
    return new Player({
      name: `${s.name}#${i + 1}`,
      color: palette.color,
      accent: palette.accent,
      strategy: s,
      tech,
    });
  });
  players.forEach((p) => game.addPlayer(p));
  const idToSlot = new Map(players.map((p, slot) => [p.id, slot]));
  const side = startingBlobSide(game.map, positions.length);
  placeStartingBlobs(game, players, positions, side);

  const eliminated = new Map();
  const N = lineup.length;
  const cumCaptures = Array.from({ length: N }, () => new Array(N).fill(0));
  const cumFromNeutral = new Array(N).fill(0);
  const cumToNeutral = new Array(N).fill(0);
  const territoryByTick = []; // [{ tick, terr: [N] }]
  let prevOwners = snapshotOwners(game);
  let endReason = "max-ticks";

  while (game.tick < 4000) {
    game.step(1 / 30);
    const alive = new Set(game.livingPlayers().map((p) => p.id));
    for (const p of players) {
      if (!alive.has(p.id) && !eliminated.has(p.id)) eliminated.set(p.id, game.tick);
    }
    if (game.tick % SNAPSHOT_EVERY === 0) {
      game.recomputeTerritory();
      const cur = snapshotOwners(game);
      const d = diffCaptures(prevOwners, cur, idToSlot);
      for (let i = 0; i < N; i++) {
        cumFromNeutral[i] += d.fromNeutral[i];
        cumToNeutral[i] += d.toNeutral[i];
        for (let j = 0; j < N; j++) cumCaptures[i][j] += d.captures[i][j];
      }
      territoryByTick.push({
        tick: game.tick,
        terr: players.map((p) => p.totals.territory),
        alive: players.map((p) => alive.has(p.id)),
      });
      prevOwners = cur;
    }
    if (alive.size <= 1) {
      endReason = alive.size === 1 ? "winner" : "mutual-destruction";
      break;
    }
  }
  game.recomputeTerritory();

  const finalTerr = players.map((p) => p.totals.territory);
  const winnerSlot = territoryByTick.length
    ? finalTerr.indexOf(Math.max(...finalTerr))
    : -1;

  return {
    seed,
    ticks: game.tick,
    endReason,
    eliminated: players.map((p) => eliminated.get(p.id) ?? null),
    finalTerr,
    captures: cumCaptures,
    fromNeutral: cumFromNeutral,
    toNeutral: cumToNeutral,
    territoryByTick,
    winnerSlot,
    winnerName: lineup[winnerSlot],
  };
}

function fmtMatrix(label, mat, names) {
  const lines = [];
  lines.push(`  ${label}:`);
  lines.push("    gainer ↓     " + names.map(n => n.padEnd(28)).join("  "));
  for (let i = 0; i < mat.length; i++) {
    lines.push("    " + names[i].padEnd(28) + "  " + mat[i].map(v => String(v).padStart(28)).join("  "));
  }
  return lines.join("\n");
}

function main() {
  console.log(`K=3 capture-matrix study  ·  lineup: [${A}, ${B}, ${C}]`);
  console.log(`Map: ${MAP.width}x${MAP.height} g${MAP.growth} m${MAP.maxArmy} ${MAP.wrap?"wrap":"nowrap"}  ·  snapshotEvery=${SNAPSHOT_EVERY} ticks  ·  ${N_SEEDS} seeds\n`);

  const seeds = [];
  for (let i = 0; i < N_SEEDS; i++) seeds.push(FIXED_SEED + i);

  const lineup = [A, B, C];
  const allRuns = seeds.map(s => runOne(lineup, POSITIONS, s));

  // Aggregate
  const N = lineup.length;
  const sumCaptures = Array.from({ length: N }, () => new Array(N).fill(0));
  const sumFromNeutral = new Array(N).fill(0);
  const sumToNeutral = new Array(N).fill(0);
  const winsBySlot = new Array(N).fill(0);
  const elimTicks = Array.from({ length: N }, () => []);
  const finalTerrSums = new Array(N).fill(0);
  const finalTerrSurvSums = new Array(N).fill(0);
  const finalTerrSurvCounts = new Array(N).fill(0);
  const matchTicks = [];

  for (const r of allRuns) {
    matchTicks.push(r.ticks);
    if (r.winnerSlot >= 0) winsBySlot[r.winnerSlot]++;
    for (let i = 0; i < N; i++) {
      sumFromNeutral[i] += r.fromNeutral[i];
      sumToNeutral[i] += r.toNeutral[i];
      finalTerrSums[i] += r.finalTerr[i];
      if (r.eliminated[i] != null) elimTicks[i].push(r.eliminated[i]);
      else { finalTerrSurvSums[i] += r.finalTerr[i]; finalTerrSurvCounts[i]++; }
      for (let j = 0; j < N; j++) sumCaptures[i][j] += r.captures[i][j];
    }
  }

  // Per-match summary
  console.log("=== Per-match outcomes ===");
  for (const r of allRuns) {
    const elim = r.eliminated.map((e, i) => e!=null?`${lineup[i]}@${e}`:`${lineup[i]} alive`).join("  ·  ");
    console.log(`  seed=${r.seed} ticks=${r.ticks} ${r.endReason} winner=${r.winnerName} terr=[${r.finalTerr.join(",")}]  ${elim}`);
  }
  console.log();

  console.log("=== Wins by slot (across "+allRuns.length+" matches) ===");
  for (let i = 0; i < N; i++) console.log(`  slot ${i} ${lineup[i].padEnd(28)}  wins: ${winsBySlot[i]}/${allRuns.length}`);
  console.log();

  console.log("=== Elimination times (mean across matches where eliminated) ===");
  for (let i = 0; i < N; i++) {
    const arr = elimTicks[i];
    const m = arr.length ? arr.reduce((s,x)=>s+x,0)/arr.length : null;
    console.log(`  ${lineup[i].padEnd(28)}  eliminated in ${arr.length}/${allRuns.length} matches  mean tick: ${m?m.toFixed(0):"-"}`);
  }
  console.log();

  console.log("=== Final territory ===");
  for (let i = 0; i < N; i++) {
    const survN = finalTerrSurvCounts[i];
    console.log(`  ${lineup[i].padEnd(28)}  mean across all: ${(finalTerrSums[i]/allRuns.length).toFixed(1)}   survived ${survN}/${allRuns.length} mean(if survived): ${survN?(finalTerrSurvSums[i]/survN).toFixed(1):"-"}`);
  }
  console.log();

  console.log("=== Capture matrix (cumulative tiles taken across "+allRuns.length+" matches) ===");
  console.log(fmtMatrix("captures[gainer][loser]", sumCaptures, lineup));
  console.log();

  console.log("=== Tile flow with neutral ===");
  console.log("  expansion (from neutral):  " + lineup.map((n,i) => `${n}=${sumFromNeutral[i]}`).join("   "));
  console.log("  loss to neutral:           " + lineup.map((n,i) => `${n}=${sumToNeutral[i]}`).join("   "));
  console.log();

  console.log("=== Net pairwise (gainer minus loser, per pair) ===");
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const ij = sumCaptures[i][j], ji = sumCaptures[j][i];
      console.log(`  ${lineup[i]} vs ${lineup[j]}: ${lineup[i]} took ${ij} from ${lineup[j]}, ${lineup[j]} took ${ji} from ${lineup[i]}, net ${ij-ji>=0?"+":""}${ij-ji} for ${lineup[i]}`);
    }
  }
  console.log();

  console.log("=== Match length stats ===");
  const ts = matchTicks.slice().sort((a,b)=>a-b);
  console.log(`  min=${ts[0]}  median=${ts[Math.floor(ts.length/2)]}  max=${ts[ts.length-1]}  mean=${(ts.reduce((s,x)=>s+x,0)/ts.length).toFixed(0)}`);

  const out = {
    A, B, C, lineup, MAP, POSITIONS, snapshotEvery: SNAPSHOT_EVERY,
    aggregate: {
      winsBySlot, sumCaptures, sumFromNeutral, sumToNeutral,
      finalTerrSums, finalTerrSurvSums, finalTerrSurvCounts, elimTicks, matchTicks,
    },
    runs: allRuns,
  };
  writeFileSync(resolve("tournament/exp-3-capture-matrix.json"), JSON.stringify(out, null, 2));
  console.log("\nWrote tournament/exp-3-capture-matrix.json");
}

main();
