#!/usr/bin/env node
// Phase 7: read a search-output JSON and append the top configs to
// tournament/maps.js as new presets. By default just prints the diff;
// pass --apply to actually write the file.
//
// Usage:
//   node tournament/map-search/promote.js [--input search.json] [--top N]
//                                          [--min-score X] [--apply]

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
function arg(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
}
const inputPath = arg("--input", "/tmp/search-full.json");
const topN = parseInt(arg("--top", "3"), 10);
const minScore = parseFloat(arg("--min-score", "0.05"));
const apply = args.includes("--apply");
const mapsPath = "tournament/maps.js";

const data = JSON.parse(readFileSync(inputPath, "utf8"));
const ranked = (data.pass2Sorted ?? []).filter(
  (r) => r.score >= minScore && !r.name.startsWith("PLANT_"),
);
if (ranked.length === 0) {
  console.error(`No configs in ${inputPath} cleared --min-score=${minScore}.`);
  process.exit(1);
}
const winners = ranked.slice(0, topN);

console.log(`Top ${winners.length} configs (score ≥ ${minScore}):`);
for (const w of winners) {
  console.log(`  ${w.name.padEnd(34)} score=${w.score.toFixed(3)} ` +
    `disc=${w.metrics.discrimination?.toFixed(2) ?? "-"} rel=${w.metrics.reliability?.toFixed(2) ?? "-"} ` +
    `tStab=${w.metrics.medianTStable?.toFixed(0) ?? "-"} ticks=${w.metrics.medianTicks?.toFixed(0) ?? "-"}`);
}

// Generate preset key + JSDoc-ish description from the spec.
function presetKey(rank) {
  return `lab${rank + 1}`;
}
function presetDescription(spec, metrics) {
  const k = spec.k ?? "?";
  return `Lab-tested map (${spec.width}x${spec.height} g=${spec.growth} ${spec.wrap ? "wrap" : "nowrap"} ${spec.topology} k=${k}). ` +
    `Composite score from map-search ranking, disc=${metrics.discrimination?.toFixed(2) ?? "-"} rel=${metrics.reliability?.toFixed(2) ?? "-"}.`;
}

// We rely on tournament/maps.js exporting `MAPS = { ... };` as a single
// object literal, then a closing brace. We append new entries before the
// closing brace.
const src = readFileSync(mapsPath, "utf8");
const closeIdx = src.lastIndexOf("};");
if (closeIdx === -1) {
  console.error(`Could not locate "};" in ${mapsPath} to append entries.`);
  process.exit(1);
}

// Detect whether each preset key already exists; skip duplicates.
const existing = new Set();
const keyRe = /^\s{2}([a-zA-Z_][a-zA-Z0-9_]*):\s*\{/gm;
let m;
while ((m = keyRe.exec(src.slice(0, closeIdx))) !== null) existing.add(m[1]);

let toAppend = "";
for (let i = 0; i < winners.length; i++) {
  const w = winners[i];
  let key = presetKey(i);
  while (existing.has(key)) key = `${key}b`;
  existing.add(key);

  const { width, height, growth, maxArmy, wrap, topology, k } = w.spec;
  const radius = topology === "ring" ? 0.42 : 0.40;
  let positionsLine;
  if (topology === "ring" || topology === "ringTight") {
    positionsLine = `(n) => ringPositions(n, { width: ${width}, height: ${height}, radiusFactor: ${topology === "ringTight" ? 0.30 : 0.42} })`;
  } else if (topology === "line") {
    positionsLine = `(n) => linePositions(n, { width: ${width}, height: ${height} })`;
  } else if (topology === "corners") {
    positionsLine = `(n) => cornersPositions(n, { width: ${width}, height: ${height} })`;
  } else {
    positionsLine = `(n) => clusteredPairsPositions(n, { width: ${width}, height: ${height} })`;
  }

  toAppend +=
`  // ${presetDescription(w.spec, w.metrics)}
  ${key}: {
    name: "${key}",
    config: { width: ${width}, height: ${height}, growth: ${growth}, maxArmy: ${maxArmy}, wrap: ${wrap} },
    positions: ${positionsLine},
  },
`;
}

console.log(`\nWould append ${winners.length} preset(s) to ${mapsPath}:`);
console.log("---");
console.log(toAppend);
console.log("---");

if (!apply) {
  console.log(`\n(Dry run — pass --apply to actually edit ${mapsPath}.)`);
  console.log(`Note: the appended entries reference helper functions (linePositions, etc.).`);
  console.log(`If they aren't already exported in maps.js, --apply will need to add them too.`);
  process.exit(0);
}

// Apply: we need to ensure the helper functions exist in maps.js. The
// current file only has ringPositions; we need to add line / corners /
// pairs helpers. Pull them straight from configs.js so behavior matches
// the search.
const needsHelpers = toAppend.includes("linePositions") || toAppend.includes("cornersPositions") || toAppend.includes("clusteredPairsPositions");
let patched = src;
if (needsHelpers && !patched.includes("function linePositions")) {
  const helpersSnippet = `
function linePositions(n, { width, height, edgePad = 1 }) {
  const y = Math.floor(height / 2);
  const usable = width - 2 * edgePad - 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? Math.floor(width / 2) : edgePad + Math.round((usable * i) / (n - 1));
    out.push({ x, y, strength: 1 });
  }
  return out;
}

function cornersPositions(n, { width, height, edgePad = 2 }) {
  const corners = [
    { x: edgePad, y: edgePad },
    { x: width - 1 - edgePad, y: height - 1 - edgePad },
    { x: width - 1 - edgePad, y: edgePad },
    { x: edgePad, y: height - 1 - edgePad },
    { x: Math.floor(width / 2), y: edgePad },
    { x: Math.floor(width / 2), y: height - 1 - edgePad },
    { x: edgePad, y: Math.floor(height / 2) },
    { x: width - 1 - edgePad, y: Math.floor(height / 2) },
  ];
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = corners[i % corners.length];
    out.push({ x: c.x, y: c.y, strength: 1 });
  }
  return out;
}

function clusteredPairsPositions(n, { width, height, radiusFactor = 0.35, pairOffset = 2 }) {
  const cx = width / 2, cy = height / 2;
  const r = Math.min(width, height) * radiusFactor;
  const pairs = Math.ceil(n / 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const pairIdx = Math.floor(i / 2);
    const angle = (pairIdx / pairs) * Math.PI * 2;
    const baseX = cx + Math.cos(angle) * r;
    const baseY = cy + Math.sin(angle) * r;
    const sign = i % 2 === 0 ? -1 : 1;
    const px = baseX + Math.cos(angle + Math.PI / 2) * pairOffset * sign;
    const py = baseY + Math.sin(angle + Math.PI / 2) * pairOffset * sign;
    out.push({
      x: clamp(Math.floor(px), 1, width - 2),
      y: clamp(Math.floor(py), 1, height - 2),
      strength: 1,
    });
  }
  return out;
}
`;
  // Insert helpers right after the `clamp` function definition.
  const clampEnd = patched.indexOf("export const MAPS");
  patched = patched.slice(0, clampEnd) + helpersSnippet + "\n" + patched.slice(clampEnd);
}
const newCloseIdx = patched.lastIndexOf("};");
patched = patched.slice(0, newCloseIdx) + toAppend + patched.slice(newCloseIdx);
writeFileSync(mapsPath, patched);
console.log(`\nWrote ${mapsPath}.`);
