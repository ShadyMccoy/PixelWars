#!/usr/bin/env node
// Phase 1 sanity tests: snapshot capture in arena.js, plus metrics
// (predictRanking, tStable, spearman). Runs in <2s; intended as a quick
// regression guard while developing later phases.

import { runMatch } from "../arena.js";
import { MAPS } from "../maps.js";
import { getStrategy } from "../../src/strategies/index.js";
import {
  predictRanking,
  ordersToRanks,
  spearman,
  tStable,
  scoresToRanks,
  spearmanByName,
  pairAccuracy,
} from "./metrics.js";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ok: ${msg}`); }
  else      { failed++; console.error(`  FAIL: ${msg}`); }
}

function near(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

console.log("\n--- spearman ---");
assert(spearman([0, 1, 2], [0, 1, 2]) === 1, "identical orders → 1");
assert(spearman([0, 1, 2], [2, 1, 0]) === -1, "reversed orders → -1");
assert(near(spearman([0, 1, 2, 3], [0, 1, 3, 2]), 0.8), "one swap → 0.8");

console.log("\n--- ordersToRanks ---");
{
  const r = ordersToRanks([2, 0, 1], 3);
  assert(r[2] === 0 && r[0] === 1 && r[1] === 2, "rank vector indexed by slot");
}

console.log("\n--- predictRanking ---");
{
  const snap = {
    tick: 50,
    perPlayer: [
      { slot: 0, strategy: "A", territory: 10, strength: 5, alive: true, armies: 1 },
      { slot: 1, strategy: "B", territory: 20, strength: 3, alive: true, armies: 1 },
      { slot: 2, strategy: "C", territory: 0,  strength: 0, alive: false, armies: 0 },
    ],
  };
  const order = predictRanking(snap);
  assert(order[0] === 1 && order[1] === 0 && order[2] === 2,
         "alive-by-territory desc, dead last");
}

console.log("\n--- runMatch with snapshotEvery ---");
{
  const map = MAPS.arena;
  const lineup = ["Trinity", "Random", "Aggressive"].map(getStrategy);
  const result = runMatch({
    strategies: lineup,
    mapConfig: map.config,
    startPositions: map.positions(3),
    seed: 7,
    maxTicks: 1500,
    snapshotEvery: 25,
  });
  assert(Array.isArray(result.snapshots), "snapshots present when snapshotEvery>0");
  assert(result.snapshots.length >= 2, `enough snapshots captured (got ${result.snapshots.length})`);
  const last = result.snapshots[result.snapshots.length - 1];
  assert(last.perPlayer.length === 3, "snapshot has all players");
  assert(typeof last.perPlayer[0].territory === "number", "territory is numeric");
  // Sanity: ticks of snapshots are multiples of snapshotEvery and monotonic
  let mono = true;
  for (let i = 1; i < result.snapshots.length; i++) {
    if (result.snapshots[i].tick <= result.snapshots[i - 1].tick) mono = false;
  }
  assert(mono, "snapshot ticks strictly increasing");
}

console.log("\n--- runMatch without snapshots is unchanged ---");
{
  const map = MAPS.arena;
  const lineup = ["Trinity", "Random"].map(getStrategy);
  const r1 = runMatch({
    strategies: lineup,
    mapConfig: map.config,
    startPositions: map.positions(2),
    seed: 1,
    maxTicks: 1000,
  });
  assert(r1.snapshots === undefined, "no snapshots field when snapshotEvery=0");
  assert(typeof r1.ticks === "number" && r1.ticks > 0, "still returns ticks");
  assert(r1.ranking.length === 2, "still returns ranking");
}

console.log("\n--- tStable monotonic-from-start ---");
{
  // Construct a fake match where the prediction at every snapshot equals
  // the final ranking. tStable should be the very first snapshot tick.
  const snaps = [
    { tick: 10, perPlayer: [
      { slot: 0, alive: true, territory: 5, strength: 1, armies: 1, strategy: "A" },
      { slot: 1, alive: true, territory: 3, strength: 1, armies: 1, strategy: "B" },
      { slot: 2, alive: true, territory: 1, strength: 1, armies: 1, strategy: "C" },
    ]},
    { tick: 20, perPlayer: [
      { slot: 0, alive: true, territory: 6, strength: 1, armies: 1, strategy: "A" },
      { slot: 1, alive: true, territory: 4, strength: 1, armies: 1, strategy: "B" },
      { slot: 2, alive: false, territory: 0, strength: 0, armies: 0, strategy: "C" },
    ]},
    { tick: 30, perPlayer: [
      { slot: 0, alive: true, territory: 7, strength: 1, armies: 1, strategy: "A" },
      { slot: 1, alive: false, territory: 0, strength: 0, armies: 0, strategy: "B" },
      { slot: 2, alive: false, territory: 0, strength: 0, armies: 0, strategy: "C" },
    ]},
  ];
  const finalOrder = [0, 1, 2];
  const t = tStable(snaps, finalOrder, 30, 0.9);
  assert(t === 10, `stable from first snapshot (got ${t})`);
}

console.log("\n--- tStable late-resolution ---");
{
  // Early snapshots predict opposite of final → tStable should land near
  // the end. Final ranking is [0, 1, 2].
  const snaps = [
    { tick: 10, perPlayer: [
      { slot: 0, alive: true, territory: 1, strength: 1, armies: 1, strategy: "A" },
      { slot: 1, alive: true, territory: 3, strength: 1, armies: 1, strategy: "B" },
      { slot: 2, alive: true, territory: 5, strength: 1, armies: 1, strategy: "C" },
    ]},
    { tick: 20, perPlayer: [
      { slot: 0, alive: true, territory: 2, strength: 1, armies: 1, strategy: "A" },
      { slot: 1, alive: true, territory: 3, strength: 1, armies: 1, strategy: "B" },
      { slot: 2, alive: true, territory: 4, strength: 1, armies: 1, strategy: "C" },
    ]},
    { tick: 30, perPlayer: [
      { slot: 0, alive: true, territory: 6, strength: 1, armies: 1, strategy: "A" },
      { slot: 1, alive: true, territory: 4, strength: 1, armies: 1, strategy: "B" },
      { slot: 2, alive: true, territory: 2, strength: 1, armies: 1, strategy: "C" },
    ]},
  ];
  const finalOrder = [0, 1, 2];
  const t = tStable(snaps, finalOrder, 30, 0.9);
  assert(t === 30, `late stabilization (got ${t})`);
}

console.log("\n--- scoresToRanks + pairAccuracy ---");
{
  const scores = { Trinity: 0.8, Random: 0.1, Aggressive: 0.4 };
  const ranks = scoresToRanks(scores);
  assert(ranks.Trinity < ranks.Aggressive && ranks.Aggressive < ranks.Random,
         "scoresToRanks orders by score desc");
  assert(pairAccuracy([["Trinity", "Random"]], ranks) === 1, "correct pair");
  assert(pairAccuracy([["Random", "Trinity"]], ranks) === 0, "wrong pair");
  assert(
    pairAccuracy([["Trinity", "Random"], ["Aggressive", "Random"], ["Random", "Trinity"]], ranks) === 2/3,
    "mixed pairs",
  );
}

console.log("\n--- spearmanByName ---");
{
  const a = scoresToRanks({ A: 0.9, B: 0.5, C: 0.1 });
  const b = scoresToRanks({ A: 0.8, B: 0.6, C: 0.2 });
  assert(spearmanByName(a, b) === 1, "consistent name-rank correlation");
  const c = scoresToRanks({ A: 0.1, B: 0.5, C: 0.9 });
  assert(spearmanByName(a, c) === -1, "reversed name-rank correlation");
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
