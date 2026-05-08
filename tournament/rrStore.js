// File IO for round-robin matrices. The matrix is large enough
// (O(N^2) pairs × S seeds each) that re-running the schedule from
// scratch every time is wasteful — we serialize the matrix to disk so
// the analysis + re-roll steps can reload without recomputing.
//
// File shape:
//   {
//     generatedAt,
//     map,                  // map preset name (e.g. "duel1")
//     mapConfig,            // copy of map.config so old runs are
//                           // self-describing if the preset changes
//     baseSeed,
//     seedsPerPair,
//     maxTicks,
//     bots,                 // sorted list of strategy names in the field
//     pairs,                // [{ a, b, games, aWins, bWins, draws,
//                           //    aTerritory, bTerritory, totalTicks,
//                           //    seeds: [...] }, ...]
//   }

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pairKey } from "./roundRobin.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = resolve(HERE, "round-robin.json");

export function getRoundRobinPath(custom = null) {
  if (custom) return resolve(custom);
  return DEFAULT_PATH;
}

// Convert a Map<key, PairStats> to a JSON-friendly array, sorted by
// pair key for stable diffs.
export function pairsToJson(pairs) {
  const arr = [...pairs.values()];
  arr.sort((x, y) => pairKey(x.a, x.b).localeCompare(pairKey(y.a, y.b)));
  return arr;
}

export function pairsFromJson(arr) {
  const out = new Map();
  for (const p of arr) out.set(pairKey(p.a, p.b), p);
  return out;
}

export async function saveRoundRobin(data, path = null) {
  const target = getRoundRobinPath(path);
  await mkdir(dirname(target), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    map: data.map,
    mapConfig: data.mapConfig,
    baseSeed: data.baseSeed,
    seedsPerPair: data.seedsPerPair,
    maxTicks: data.maxTicks,
    bots: data.bots,
    pairs: pairsToJson(data.pairs),
  };
  await writeFile(target, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return target;
}

export async function loadRoundRobin(path = null) {
  const target = getRoundRobinPath(path);
  try {
    const txt = await readFile(target, "utf8");
    const parsed = JSON.parse(txt);
    if (!parsed || !Array.isArray(parsed.pairs)) return null;
    parsed.pairsMap = pairsFromJson(parsed.pairs);
    return parsed;
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
