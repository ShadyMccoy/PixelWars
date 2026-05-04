// Persistence for "interesting" matches that we want to replay later. The
// public API (loadInteresting / appendInteresting / clearInteresting) is
// designed to be swappable: the Node backend uses fs and a JSON file at
// tournament/interesting.json; a future browser backend would expose the
// same shape on top of localStorage.
//
// Entry shape — fully self-contained so a replay survives changes to
// tournament/maps.js or src/strategies/index.js (as long as the named
// strategies still exist):
//
//   {
//     id: <int>,
//     savedAt: <ISO string>,
//     map: <preset name>,
//     mapConfig: { width, height, growth, maxArmy, wrap },
//     startPositions: [{ x, y, strength }, ...],
//     seed: <int>,
//     maxTicks: <int>,
//     lineup: [strategyName, ...],
//     flags: [{ tag, note }, ...],
//     ticks: <int>,
//     endReason: "winner" | "mutual-destruction" | "max-ticks",
//     ranking: [...] // copied from runMatch result
//   }

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = resolve(HERE, "interesting.json");

async function readStore() {
  try {
    const txt = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(txt);
    if (!parsed || !Array.isArray(parsed.entries)) return { entries: [] };
    return parsed;
  } catch (e) {
    if (e.code === "ENOENT") return { entries: [] };
    throw e;
  }
}

async function writeStore(store) {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export async function loadInteresting() {
  const store = await readStore();
  return store.entries;
}

// Avoid double-saving the same (map, seed, lineup) combination across runs.
function entryKey(e) {
  return `${e.map}|${e.seed}|${(e.lineup || []).join(",")}`;
}

export async function appendInteresting(newEntries) {
  if (!Array.isArray(newEntries)) newEntries = [newEntries];
  if (newEntries.length === 0) return { entries: [], added: [] };

  const store = await readStore();
  const seen = new Set(store.entries.map(entryKey));
  let nextId = store.entries.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1;
  const added = [];

  for (const e of newEntries) {
    if (seen.has(entryKey(e))) continue;
    const stamped = { id: nextId++, savedAt: new Date().toISOString(), ...e };
    store.entries.push(stamped);
    added.push(stamped);
    seen.add(entryKey(stamped));
  }

  await writeStore(store);
  return { entries: store.entries, added };
}

export async function clearInteresting() {
  await writeStore({ entries: [] });
}

export function getStorePath() {
  return STORE_PATH;
}
