#!/usr/bin/env node
// 2x2 slot × position experiment for K=2.
//
// At K=2 with wrap, "slot 0" wins 100% of matches regardless of which
// bot is in it. The two BASE_POSITIONS used (positions[0]=(11,8) and
// positions[3]=(34,23)) are torus-symmetric, so the question is whether
// the advantage is:
//   - tick-order (slot 0 acts first each tick), OR
//   - the specific position (11,8) confers an advantage no matter who sits there.
//
// Design: 4 conditions = 2 slot-0 holders × 2 slot-0 positions, 30 seeds each.
// (No source-code peek; data only.)

import { runMatch } from "./arena.js";
import { getStrategy } from "../src/strategies/index.js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const A = "Conqueror_g8_4d842b";
const B = "Conqueror_g8_2c6b71";
const MAP = { width: 45, height: 45, growth: 1.2, maxArmy: 12, wrap: true };
const POS_X = { x: 11, y:  8, strength: 1 };  // "position X"
const POS_Y = { x: 34, y: 23, strength: 1 };  // "position Y"
const FIXED_SEED = 88242417;
const N_SEEDS = 30;

function seedSeq(base, n) { const out=[]; for (let i=0;i<n;i++) out.push(base+i); return out; }

function runOne(lineup, positions, seed) {
  const strategies = lineup.map((n) => getStrategy(n));
  const result = runMatch({ strategies, mapConfig: MAP, startPositions: positions, seed, maxTicks: 4000 });
  const byName = {};
  for (let i = 0; i < result.ranking.length; i++) {
    const r = result.ranking[i];
    byName[r.strategy] = { place: i, terr: r.territory, survived: r.survived, elim: r.eliminatedAt };
  }
  return {
    seed,
    winner: result.ranking[0]?.strategy,
    a: byName[A],
    b: byName[B],
    ticks: result.ticks,
  };
}

function summarize(label, runs) {
  const aWins = runs.filter(r => r.winner === A).length;
  const bWins = runs.filter(r => r.winner === B).length;
  const meanTicks = runs.reduce((s, r) => s + r.ticks, 0) / runs.length;
  return { label, n: runs.length, aWins, bWins, meanTicks };
}

const conditions = [
  { name: "slot0=A at posX=(11,8) | slot1=B at posY=(34,23)", lineup: [A,B], positions: [POS_X, POS_Y] },
  { name: "slot0=B at posX=(11,8) | slot1=A at posY=(34,23)", lineup: [B,A], positions: [POS_X, POS_Y] },
  { name: "slot0=A at posY=(34,23) | slot1=B at posX=(11,8)", lineup: [A,B], positions: [POS_Y, POS_X] },
  { name: "slot0=B at posY=(34,23) | slot1=A at posX=(11,8)", lineup: [B,A], positions: [POS_Y, POS_X] },
];

const seeds = seedSeq(FIXED_SEED, N_SEEDS);
const results = [];
console.log(`2x2 slot × position matrix on map ${MAP.width}x${MAP.height} g${MAP.growth} m${MAP.maxArmy} ${MAP.wrap?"wrap":"nowrap"}`);
console.log(`Seeds: ${seeds[0]}..${seeds[seeds.length-1]} (n=${seeds.length})\n`);
for (const c of conditions) {
  const runs = seeds.map(s => runOne(c.lineup, c.positions, s));
  const sum = summarize(c.name, runs);
  console.log(`  ${sum.label}`);
  console.log(`     A wins: ${sum.aWins}/${sum.n}   B wins: ${sum.bWins}/${sum.n}   mean ticks: ${sum.meanTicks.toFixed(0)}\n`);
  results.push({ ...sum, runs });
}

console.log("=== Disentanglement ===");
const c1 = results[0], c2 = results[1], c3 = results[2], c4 = results[3];
console.log(`  Hypothesis: slot 0 always wins → expect A wins 1+3, B wins 2+4`);
console.log(`     observed slot-0 win rates: c1(A)=${c1.aWins}/${c1.n}  c2(B)=${c2.bWins}/${c2.n}  c3(A)=${c3.aWins}/${c3.n}  c4(B)=${c4.bWins}/${c4.n}`);
console.log(`  Hypothesis: position (11,8) always wins → expect (11,8)-holder wins all four`);
console.log(`     observed (11,8)-holder win rates: c1(A)=${c1.aWins}/${c1.n}  c2(B)=${c2.bWins}/${c2.n}  c3(B)=${c3.bWins}/${c3.n}  c4(A)=${c4.aWins}/${c4.n}`);
console.log(`  Hypothesis: A is just better than B 1v1 → expect A wins all four`);
console.log(`     A win rates: c1=${c1.aWins}/${c1.n}  c2=${c2.aWins}/${c2.n}  c3=${c3.aWins}/${c3.n}  c4=${c4.aWins}/${c4.n}`);

writeFileSync(resolve("tournament/exp-2-slot-vs-position.json"), JSON.stringify({ A, B, MAP, POS_X, POS_Y, conditions: results }, null, 2));
console.log("\nWrote tournament/exp-2-slot-vs-position.json");
