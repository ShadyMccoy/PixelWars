#!/usr/bin/env node
// Flexible H2H runner: assign any strategy to each of the 6 slots.
// Used to test position-effect hypotheses.
//
//   node tournament/_variants/run-h2h-flexible.js \
//      --s1 Conqueror_g8_4d842b --s2 Conqueror_g6_15ea9a \
//      --s3 Conqueror_g8_2c6b71 --s4 Conqueror_g10_e067cc \
//      --s5 Conqueror_g2_6b59e8 --s6 Conqueror_g9_c81d7f
//
// Defaults match the URL lineup. Names of variants from
// instrumented-bots.js are also honored (e.g. V_4d842b_orig).

import { Game } from "../../src/core/Game.js";
import { Player } from "../../src/core/Player.js";
import { NEUTRAL_TECH } from "../../src/core/Tech.js";
import { startingBlobSide, placeStartingBlobs } from "../../src/core/startup.js";
import { getStrategy } from "../../src/strategies/index.js";
import { VARIANTS, TELEMETRY } from "./instrumented-bots.js";

const MAP = { width: 45, height: 45, growth: 1.2, maxArmy: 12, wrap: true };

const POS = [
  { x: 11, y: 8  },
  { x: 34, y: 8  },
  { x: 11, y: 23 },
  { x: 34, y: 23 },
  { x: 11, y: 38 },
  { x: 34, y: 38 },
];

const DEFAULTS = [
  "Conqueror_g8_4d842b",
  "Conqueror_g10_e067cc",
  "Conqueror_g8_2c6b71",
  "Conqueror_g6_15ea9a",
  "Conqueror_g2_6b59e8",
  "Conqueror_g9_c81d7f",
];

const PALETTE = [
  { color: "#ff4d6d", accent: "#ff8fa3" },
  { color: "#3ea6ff", accent: "#8ecbff" },
  { color: "#a16bff", accent: "#cdb4ff" },
  { color: "#52e0a4", accent: "#a8f3d2" },
  { color: "#ffb84d", accent: "#ffd699" },
  { color: "#f97aff", accent: "#fbc2ff" },
];

function parseArgs(argv) {
  const opts = { s: [...DEFAULTS], seed: 88242417, ticks: 4000, snapshot: 0, label: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    const m = a.match(/^--s([1-6])$/);
    if (m) { opts.s[parseInt(m[1],10)-1] = next(); continue; }
    switch (a) {
      case "--seed": opts.seed = parseInt(next(), 10); break;
      case "--ticks": opts.ticks = parseInt(next(), 10); break;
      case "--snapshot": opts.snapshot = parseInt(next(), 10); break;
      case "--label": opts.label = next(); break;
      default: throw new Error("Unknown flag: " + a);
    }
  }
  return opts;
}

function resolve(name) {
  if (VARIANTS[name]) return VARIANTS[name];
  return getStrategy(name);
}

const opts = parseArgs(process.argv.slice(2));
for (const k of Object.keys(TELEMETRY)) delete TELEMETRY[k];
const game = new Game({ ...MAP, seed: opts.seed, maxHistory: 0 });
const players = opts.s.map((name, i) => {
  const strat = resolve(name);
  const tech = strat.tech ? { ...NEUTRAL_TECH, ...strat.tech } : { ...NEUTRAL_TECH };
  const palette = PALETTE[i % PALETTE.length];
  return new Player({
    name: `${strat.name}#${i + 1}`,
    color: palette.color,
    accent: palette.accent,
    strategy: strat,
    tech,
  });
});
players.forEach((p) => game.addPlayer(p));
const positions = POS.map((p) => ({ x: p.x, y: p.y, strength: 1 }));
const side = startingBlobSide(game.map, positions.length);
placeStartingBlobs(game, players, positions, side);

const eliminated = new Map();
const snapshots = opts.snapshot > 0 ? [] : null;
let endReason = "max-ticks";
while (game.tick < opts.ticks) {
  game.step(1 / 30);
  const alive = new Set(game.livingPlayers().map((p) => p.id));
  for (const p of players) {
    if (!alive.has(p.id) && !eliminated.has(p.id)) eliminated.set(p.id, game.tick);
  }
  if (snapshots && game.tick % opts.snapshot === 0) {
    game.recomputeTerritory();
    snapshots.push({
      tick: game.tick,
      per: players.map((p) => ({
        slot: players.indexOf(p) + 1,
        name: p.strategy.name,
        terr: p.totals.territory,
        alive: alive.has(p.id),
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
  const aSurv = !eliminated.has(a.id);
  const bSurv = !eliminated.has(b.id);
  if (aSurv !== bSurv) return bSurv ? 1 : -1;
  if (aSurv) {
    if (a.totals.territory !== b.totals.territory) return b.totals.territory - a.totals.territory;
    return b.totals.strength - a.totals.strength;
  }
  return (eliminated.get(b.id) ?? 0) - (eliminated.get(a.id) ?? 0);
});

const tag = opts.label ? `[${opts.label}] ` : "";
console.log(`${tag}seed=${opts.seed} ticks=${game.tick} ${endReason}`);
console.log(`${tag}lineup: ${opts.s.map((n,i)=>`s${i+1}=${n}`).join(", ")}`);
for (let i = 0; i < ranked.length; i++) {
  const p = ranked[i];
  const slot = players.indexOf(p) + 1;
  const elim = eliminated.get(p.id);
  console.log(`${tag}  #${i + 1} slot${slot} ${p.strategy.name.padEnd(22)} terr=${String(p.totals.territory).padStart(4)} elim=${elim ?? "alive"}`);
}
if (snapshots) {
  console.log("\nTerritory series:");
  console.log("tick\t" + snapshots[0].per.map((p) => `s${p.slot}_${p.name.replace("Conqueror_","").replace("V_","").slice(0,8)}`).join("\t"));
  for (const s of snapshots) {
    console.log(s.tick + "\t" + s.per.map((p) => (p.alive ? p.terr : "DEAD")).join("\t"));
  }
}
