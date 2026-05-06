#!/usr/bin/env node
// Phase 3 sanity tests: config generator + topologies.

import { makeConfig, configName, defaultGrid, smallGrid, planted, topologyFns } from "./configs.js";
import { runMatch } from "../arena.js";
import { getStrategy } from "../../src/strategies/index.js";

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ok: ${msg}`); }
  else      { failed++; console.error(`  FAIL: ${msg}`); }
}

console.log("\n--- topology shapes ---");
for (const [name, fn] of Object.entries(topologyFns)) {
  for (const n of [2, 3, 4, 6, 8]) {
    const dims = { width: 30, height: 22 };
    const pos = fn(n, dims);
    let ok = pos.length === n;
    for (const p of pos) {
      if (p.x < 0 || p.x >= dims.width || p.y < 0 || p.y >= dims.height) ok = false;
    }
    assert(ok, `${name}(n=${n}) returns ${n} in-bounds positions`);
  }
}

console.log("\n--- topology determinism ---");
for (const [name, fn] of Object.entries(topologyFns)) {
  const a = fn(4, { width: 30, height: 22 });
  const b = fn(4, { width: 30, height: 22 });
  assert(JSON.stringify(a) === JSON.stringify(b), `${name} is deterministic`);
}

console.log("\n--- positions are distinct (where they should be) ---");
for (const tname of ["ring", "ringTight", "line", "corners"]) {
  const fn = topologyFns[tname];
  const pos = fn(6, { width: 38, height: 28 });
  const keys = new Set(pos.map((p) => `${p.x},${p.y}`));
  assert(keys.size === 6, `${tname}(n=6) gives 6 distinct tiles`);
}

console.log("\n--- configName ---");
{
  const n = configName({ width: 30, height: 22, growth: 1.2, maxArmy: 6, wrap: true, topology: "ring", k: 4 });
  assert(n === "30x22_g1p2_m6_wrap_ring_k4", `name format: ${n}`);
}

console.log("\n--- grids ---");
{
  const g = defaultGrid();
  assert(g.length >= 50 && g.length <= 200, `defaultGrid size sane (${g.length})`);
  const names = new Set(g.map((c) => c.name));
  assert(names.size === g.length, "defaultGrid names are unique");

  const s = smallGrid();
  assert(s.length === 6, `smallGrid has 6 configs (${s.length})`);

  const p = planted();
  assert(p.length >= 1, `planted has degenerate sentinels (${p.length})`);
}

console.log("\n--- makeConfig consumed by runMatch ---");
{
  const cfg = makeConfig({ width: 24, height: 18, growth: 1.5, maxArmy: 6, wrap: true, topology: "line", k: 3 });
  const lineup = ["Trinity", "Random", "Aggressive"].map(getStrategy);
  const result = runMatch({
    strategies: lineup,
    mapConfig: cfg.config,
    startPositions: cfg.positions(3),
    seed: 1,
    maxTicks: 800,
  });
  assert(typeof result.ticks === "number" && result.ticks > 0, `ran a match (ticks=${result.ticks})`);
  assert(result.ranking.length === 3, "match returned ranking for 3");
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
