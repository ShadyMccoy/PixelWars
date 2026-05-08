#!/usr/bin/env node
// Variant H2H runner. Lets us swap in instrumented variants in place
// of the two main bots while keeping the rest of the URL lineup
// unchanged. Reports head-to-head finish positions and dumps the
// telemetry counters at end-of-match.
//
//   node tournament/_variants/run-h2h.js --slot1 V_4d842b_orig --slot3 V_2c6b71_orig
//
// Slot 1 is at (11,8); slot 3 is at (11,23). The rest of the lineup
// (e067cc, 15ea9a, 6b59e8, c81d7f) is fixed.

import { Game } from "../../src/core/Game.js";
import { Player } from "../../src/core/Player.js";
import { NEUTRAL_TECH } from "../../src/core/Tech.js";
import { startingBlobSide, placeStartingBlobs } from "../../src/core/startup.js";
import { getStrategy } from "../../src/strategies/index.js";
import { VARIANTS, TELEMETRY } from "./instrumented-bots.js";

const MAP = { width: 45, height: 45, growth: 1.2, maxArmy: 12, wrap: true };

const DEFAULT_LINEUP = [
  { ref: { kind: "named",   name: "Conqueror_g8_4d842b"  }, x: 11, y: 8  }, // slot 1
  { ref: { kind: "named",   name: "Conqueror_g10_e067cc" }, x: 34, y: 8  },
  { ref: { kind: "named",   name: "Conqueror_g8_2c6b71"  }, x: 11, y: 23 }, // slot 3
  { ref: { kind: "named",   name: "Conqueror_g6_15ea9a"  }, x: 34, y: 23 },
  { ref: { kind: "named",   name: "Conqueror_g2_6b59e8"  }, x: 11, y: 38 },
  { ref: { kind: "named",   name: "Conqueror_g9_c81d7f"  }, x: 34, y: 38 },
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
  const opts = {
    slot1: null,
    slot3: null,
    swapPositions: false,
    seed: 88242417,
    seeds: 1,
    ticks: 4000,
    snapshot: 0,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--slot1": opts.slot1 = next(); break;
      case "--slot3": opts.slot3 = next(); break;
      case "--swap-positions": opts.swapPositions = true; break;
      case "--seed": opts.seed = parseInt(next(), 10); break;
      case "--seeds": opts.seeds = parseInt(next(), 10); break;
      case "--ticks": opts.ticks = parseInt(next(), 10); break;
      case "--snapshot": opts.snapshot = parseInt(next(), 10); break;
      case "--quiet": opts.quiet = true; break;
      default: throw new Error("Unknown flag: " + a);
    }
  }
  return opts;
}

function resolveStrategy(name) {
  if (name && VARIANTS[name]) return VARIANTS[name];
  return getStrategy(name);
}

function runOne(opts) {
  // Reset telemetry per run.
  for (const k of Object.keys(TELEMETRY)) delete TELEMETRY[k];

  const lineup = DEFAULT_LINEUP.map((l) => ({ ...l }));
  if (opts.slot1) lineup[0].ref = { kind: "variant", name: opts.slot1 };
  if (opts.slot3) lineup[2].ref = { kind: "variant", name: opts.slot3 };
  if (opts.swapPositions) {
    const tmp = { x: lineup[0].x, y: lineup[0].y };
    lineup[0].x = lineup[2].x; lineup[0].y = lineup[2].y;
    lineup[2].x = tmp.x;       lineup[2].y = tmp.y;
  }

  const game = new Game({ ...MAP, seed: opts.seed, maxHistory: 0 });
  const players = lineup.map((l, i) => {
    const strat = l.ref.kind === "variant" ? VARIANTS[l.ref.name] : getStrategy(l.ref.name);
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
  const positions = lineup.map((l) => ({ x: l.x, y: l.y, strength: 1 }));
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
          name: p.strategy.name,
          terr: p.totals.territory,
          str: +p.totals.strength.toFixed(1),
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

  return {
    seed: opts.seed,
    ticks: game.tick,
    endReason,
    ranking: ranked.map((p) => ({
      name: p.strategy.name,
      terr: p.totals.territory,
      str: +p.totals.strength.toFixed(2),
      eliminatedAt: eliminated.get(p.id) ?? null,
      survived: !eliminated.has(p.id),
    })),
    telemetry: JSON.parse(JSON.stringify(TELEMETRY)),
    snapshots,
  };
}

const opts = parseArgs(process.argv.slice(2));
const r = runOne(opts);

const slot1Name = opts.slot1 ?? "Conqueror_g8_4d842b";
const slot3Name = opts.slot3 ?? "Conqueror_g8_2c6b71";

const r1 = r.ranking.findIndex((x) => x.name === slot1Name);
const r3 = r.ranking.findIndex((x) => x.name === slot3Name);
console.log(`\nseed=${r.seed} ticks=${r.ticks} ${r.endReason}`);
console.log(`slot1 (${slot1Name}) finished #${r1 + 1}, eliminatedAt=${r.ranking[r1]?.eliminatedAt ?? "alive"} terr=${r.ranking[r1]?.terr}`);
console.log(`slot3 (${slot3Name}) finished #${r3 + 1}, eliminatedAt=${r.ranking[r3]?.eliminatedAt ?? "alive"} terr=${r.ranking[r3]?.terr}`);
console.log(`pairwise: ${r1 < r3 ? slot1Name : slot3Name} finished higher`);

if (!opts.quiet) {
  console.log("\nFull ranking:");
  for (let i = 0; i < r.ranking.length; i++) {
    const e = r.ranking[i];
    console.log(`  #${i + 1} ${e.name.padEnd(22)} terr=${String(e.terr).padStart(4)} elim=${e.eliminatedAt ?? "alive"}`);
  }
  if (r.telemetry && Object.keys(r.telemetry).length) {
    console.log("\nTelemetry (per variant):");
    for (const [k, v] of Object.entries(r.telemetry)) {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    }
  }
  if (r.snapshots) {
    console.log("\nTerritory series:");
    console.log("tick\t" + r.snapshots[0].per.map((p) => p.name.replace("Conqueror_", "").replace("V_", "")).join("\t"));
    for (const s of r.snapshots) {
      console.log(s.tick + "\t" + s.per.map((p) => (p.alive ? p.terr : "DEAD")).join("\t"));
    }
  }
}
