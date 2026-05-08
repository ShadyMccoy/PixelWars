#!/usr/bin/env node
// Conduit gradient sweep — head-to-head vs parent for clean ordering.
// Each variant plays 100 1v1 matches against Conqueror_g13_b41df9
// across position rotation; the one with the highest win% wins.

import { sumStrength } from "../src/core/Army.js";
import Parent from "../src/strategies/Conqueror_g13_b41df9.js";
import { MAPS } from "./maps.js";
import { runMatch } from "./arena.js";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(HERE, "exp-conduit-tuning.json");

const BASE_MAP = MAPS.lab1;
const MAX_TICKS = 4000;
const MATCHES = 100;
const TECH = { move: 80, stack: 0, prod: 12, atk: 4, def: 4 };

function scanPressure1(stencil, viewer) {
  if (!stencil) return 0;
  let p = 0;
  for (let i = 0; i < 25; i++) {
    const c = stencil[i];
    if (!c) continue;
    const e = -sumStrength(c.armies, viewer);
    if (e > 0) p += e;
  }
  return p;
}

function makeVariant(name, gradient) {
  return {
    name,
    author: "claude",
    version: 1,
    description: `Conduit gradient=${gradient}`,
    tech: TECH,
    act(army, game) {
      const tile = army.tile;
      if (!tile) return;
      const sLimit = army.attackPower;
      if (sLimit <= 0.5) { Parent.act(army, game); return; }
      const neighbors = tile.neighbors;
      const pid = army.player.id;
      const viewer = army.player;

      let hasAdjEnemy = false;
      let hasAdjEmpty = false;
      let friends = null;
      for (let i = 0; i < 4; i++) {
        const t = neighbors[i];
        if (!t) continue;
        const tarmies = t.armies;
        if (tarmies.length === 0) { hasAdjEmpty = true; continue; }
        let f = null, e = 0;
        for (let k = 0; k < tarmies.length; k++) {
          const a = tarmies[k];
          if (a.player.id === pid) f = a;
          else e += a.strength;
        }
        if (e > 0) { hasAdjEnemy = true; continue; }
        if (f && f.strength < f.maxStrength - 0.5) {
          if (!friends) friends = [];
          friends.push({ tile: t, friendly: f });
        }
      }
      if (hasAdjEnemy || hasAdjEmpty) { Parent.act(army, game); return; }
      if (!friends) { Parent.act(army, game); return; }

      const myP = scanPressure1(tile.stencil5, viewer);
      let best = null;
      let bestP = -Infinity;
      for (let i = 0; i < friends.length; i++) {
        const f = friends[i];
        const p = scanPressure1(f.tile.stencil5, viewer);
        if (p > bestP) { bestP = p; best = f; }
      }
      if (best && bestP - myP >= gradient) {
        const fa = best.friendly;
        const room = fa.maxStrength - fa.strength;
        const power = Math.min(sLimit, room);
        if (power > 0.5) { army.attack(best.tile, power); return; }
      }
      Parent.act(army, game);
    },
  };
}

const GRADIENTS = [0.0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0];

async function headToHead(variant) {
  const positions = BASE_MAP.positions(2);
  let wins = 0;
  let myTerr = 0;
  for (let m = 0; m < MATCHES; m++) {
    // Alternate seats to remove position bias.
    const lineup = (m % 2 === 0)
      ? [variant, Parent]
      : [Parent, variant];
    const result = runMatch({
      strategies: lineup.map((s) => ({ strategy: s, tech: TECH, name: s.name })),
      mapConfig: { ...BASE_MAP.config },
      startPositions: positions,
      seed: 5000 + m,
      maxTicks: MAX_TICKS,
    });
    const winnerName = result.ranking[0].entryName.replace(/#\d+$/, "");
    if (winnerName === variant.name) wins++;
    for (const r of result.ranking) {
      if (r.entryName.replace(/#\d+$/, "") === variant.name) myTerr += r.territory ?? 0;
    }
  }
  return { name: variant.name, wins, played: MATCHES, avgTerr: myTerr / MATCHES };
}

async function main() {
  const t0 = Date.now();
  const rows = [];
  for (const g of GRADIENTS) {
    const v = makeVariant(`Conduit-g${g}`, g);
    const r = await headToHead(v);
    r.gradient = g;
    r.winRate = r.wins / r.played;
    const dt = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`g=${String(g).padStart(5)}  wins ${r.wins}/${r.played} (${(100 * r.winRate).toFixed(1)}%)  avgTerr ${r.avgTerr.toFixed(1)}  [${dt}s]`);
    rows.push(r);
  }
  rows.sort((a, b) => b.winRate - a.winRate);
  console.log(`\nRanking by win% vs parent:`);
  for (const r of rows) {
    console.log(`  g=${String(r.gradient).padStart(5)}  ${(100 * r.winRate).toFixed(1).padStart(5)}%  avgTerr ${r.avgTerr.toFixed(1)}`);
  }
  await writeFile(OUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), matches: MATCHES, rows }, null, 2) + "\n", "utf8");
}

main().catch((e) => { console.error(e); process.exit(1); });
