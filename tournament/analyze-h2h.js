#!/usr/bin/env node
// Analysis harness for the 4d842b vs 2c6b71 head-to-head on the
// pixlwars.win URL config. Runs the exact 6-bot match across many
// seeds, then aggregates per-tick territory and elimination order.
//
// Invocation:
//   node tournament/analyze-h2h.js --seeds 50 [--snapshot 25] [--json]
//
// Map config from the URL:
//   w=45, h=45, g=1.2, m=12, wrap=1
// Lineup (in URL order):
//   1: Conqueror_g8_4d842b   at (11,8)
//   2: Conqueror_g10_e067cc  at (34,8)
//   3: Conqueror_g8_2c6b71   at (11,23)
//   4: Conqueror_g6_15ea9a   at (34,23)
//   5: Conqueror_g2_6b59e8   at (11,38)
//   6: Conqueror_g9_c81d7f   at (34,38)
//
// 4d842b sits directly N of 2c6b71; with wrap, 6b59e8 is 15 tiles
// south of 2c6b71 (which is also 15 tiles N of 4d842b via wrap).
// So 4d842b is wedged between 2c6b71 (south) and 6b59e8 (north
// via wrap), sharing the x=11 column with both.

import { Game } from "../src/core/Game.js";
import { Player } from "../src/core/Player.js";
import { NEUTRAL_TECH } from "../src/core/Tech.js";
import { startingBlobSide, placeStartingBlobs } from "../src/core/startup.js";
import { getStrategy } from "../src/strategies/index.js";

const MAP = { width: 45, height: 45, growth: 1.2, maxArmy: 12, wrap: true };

const LINEUP = [
  { name: "Conqueror_g8_4d842b",  x: 11, y: 8 },
  { name: "Conqueror_g10_e067cc", x: 34, y: 8 },
  { name: "Conqueror_g8_2c6b71",  x: 11, y: 23 },
  { name: "Conqueror_g6_15ea9a",  x: 34, y: 23 },
  { name: "Conqueror_g2_6b59e8",  x: 11, y: 38 },
  { name: "Conqueror_g9_c81d7f",  x: 34, y: 38 },
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
  const opts = { seeds: 25, baseSeed: 88242417, snapshot: 0, ticks: 4000, json: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--seeds": opts.seeds = parseInt(next(), 10); break;
      case "--base-seed": opts.baseSeed = parseInt(next(), 10); break;
      case "--snapshot": opts.snapshot = parseInt(next(), 10); break;
      case "--ticks": opts.ticks = parseInt(next(), 10); break;
      case "--json": opts.json = true; break;
      case "--verbose": opts.verbose = true; break;
      default: throw new Error("Unknown flag: " + a);
    }
  }
  return opts;
}

function runOne(seed, snapshotEvery, maxTicks) {
  const game = new Game({ ...MAP, seed, maxHistory: 0 });
  const players = LINEUP.map((l, i) => {
    const strat = getStrategy(l.name);
    const tech = strat.tech ? { ...NEUTRAL_TECH, ...strat.tech } : { ...NEUTRAL_TECH };
    const palette = PALETTE[i % PALETTE.length];
    return new Player({
      name: `${l.name}#${i + 1}`,
      color: palette.color,
      accent: palette.accent,
      strategy: strat,
      tech,
    });
  });
  players.forEach((p) => game.addPlayer(p));
  const positions = LINEUP.map((l) => ({ x: l.x, y: l.y, strength: 1 }));
  const side = startingBlobSide(game.map, positions.length);
  placeStartingBlobs(game, players, positions, side);

  const eliminated = new Map();
  const snapshots = snapshotEvery > 0 ? [] : null;
  let endReason = "max-ticks";
  while (game.tick < maxTicks) {
    game.step(1 / 30);
    const alive = new Set(game.livingPlayers().map((p) => p.id));
    for (const p of players) {
      if (!alive.has(p.id) && !eliminated.has(p.id)) eliminated.set(p.id, game.tick);
    }
    if (snapshots && game.tick % snapshotEvery === 0) {
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
    seed,
    ticks: game.tick,
    endReason,
    ranking: ranked.map((p) => ({
      name: p.strategy.name,
      terr: p.totals.territory,
      str: +p.totals.strength.toFixed(2),
      eliminatedAt: eliminated.get(p.id) ?? null,
      survived: !eliminated.has(p.id),
    })),
    snapshots,
  };
}

const opts = parseArgs(process.argv.slice(2));
const results = [];
for (let s = 0; s < opts.seeds; s++) {
  const seed = opts.baseSeed + s;
  const r = runOne(seed, opts.snapshot, opts.ticks);
  results.push(r);
  if (opts.verbose) {
    const top = r.ranking.slice(0, 3).map((x) => x.name).join(", ");
    const r4 = r.ranking.findIndex((x) => x.name === "Conqueror_g8_4d842b");
    const r2 = r.ranking.findIndex((x) => x.name === "Conqueror_g8_2c6b71");
    console.log(`seed=${seed} ticks=${r.ticks} ${r.endReason} | top: ${top} | 4d842b=#${r4 + 1} 2c6b71=#${r2 + 1}`);
  }
}

// Aggregate.
const finishCounts = {};
const winsByName = {};
const sumFinishByName = {};
const playedByName = {};
const eliminationByName = {};
const headToHeadFinishes = []; // for 4d842b vs 2c6b71
for (const r of results) {
  for (let rank = 0; rank < r.ranking.length; rank++) {
    const e = r.ranking[rank];
    finishCounts[e.name] = finishCounts[e.name] || [0, 0, 0, 0, 0, 0];
    finishCounts[e.name][rank]++;
    sumFinishByName[e.name] = (sumFinishByName[e.name] || 0) + rank;
    playedByName[e.name] = (playedByName[e.name] || 0) + 1;
    if (rank === 0) winsByName[e.name] = (winsByName[e.name] || 0) + 1;
    if (e.eliminatedAt != null) {
      eliminationByName[e.name] = eliminationByName[e.name] || [];
      eliminationByName[e.name].push(e.eliminatedAt);
    }
  }
  const r4 = r.ranking.findIndex((x) => x.name === "Conqueror_g8_4d842b");
  const r2 = r.ranking.findIndex((x) => x.name === "Conqueror_g8_2c6b71");
  headToHeadFinishes.push({ seed: r.seed, r4, r2, winnerOfPair: r4 < r2 ? "4d842b" : (r2 < r4 ? "2c6b71" : "tie") });
}

const summary = {
  matches: results.length,
  per: LINEUP.map((l) => {
    const fc = finishCounts[l.name] || [0,0,0,0,0,0];
    const elim = eliminationByName[l.name] || [];
    const avgElim = elim.length ? +(elim.reduce((a,b)=>a+b,0)/elim.length).toFixed(1) : null;
    return {
      name: l.name,
      played: playedByName[l.name] || 0,
      wins: winsByName[l.name] || 0,
      avgFinish: +((sumFinishByName[l.name]||0)/(playedByName[l.name]||1)).toFixed(2),
      finishHist: fc,
      avgEliminatedAt: avgElim,
      survivedCount: (playedByName[l.name]||0) - elim.length,
    };
  }),
  pairwise_4d842b_vs_2c6b71: {
    "4d842b_finishes_higher": headToHeadFinishes.filter((h)=>h.winnerOfPair==="4d842b").length,
    "2c6b71_finishes_higher": headToHeadFinishes.filter((h)=>h.winnerOfPair==="2c6b71").length,
    ties: headToHeadFinishes.filter((h)=>h.winnerOfPair==="tie").length,
    sample: headToHeadFinishes.slice(0, 10),
  },
};

if (opts.json) {
  console.log(JSON.stringify({ opts, summary, results }, null, 2));
} else {
  console.log(`\n=== ${opts.seeds} seed(s) starting at ${opts.baseSeed} ===`);
  console.log("name                       played wins avgFinish avgElim survived");
  for (const p of summary.per) {
    console.log(
      `${p.name.padEnd(26)} ${String(p.played).padStart(6)} ${String(p.wins).padStart(4)} ${String(p.avgFinish).padStart(9)} ${String(p.avgEliminatedAt ?? "-").padStart(7)} ${String(p.survivedCount).padStart(8)}`,
    );
  }
  const pw = summary.pairwise_4d842b_vs_2c6b71;
  console.log(`\nHead-to-head (which finished higher): 4d842b=${pw["4d842b_finishes_higher"]} 2c6b71=${pw["2c6b71_finishes_higher"]} ties=${pw.ties}`);
}
