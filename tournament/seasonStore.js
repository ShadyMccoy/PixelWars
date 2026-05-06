// Persistence for season results. Append-only history so the spawn
// agent (next deliverable) can read the parent bot's recent matches and
// losses for context. Capped to keep the file size bounded.
//
// File: tournament/seasons.json with shape:
//   {
//     seasons: [
//       {
//         id:          1,
//         savedAt:     ISO,
//         map:         "lab1",
//         rrMap:       "lab3",
//         poolSize:    6,
//         matches:     200,
//         baseSeed:    1,
//         champions:   [{ kind, name }, ...],
//         topField:    ["Trinity", ...],
//         standings:   [{ name, rating, rd, played, ... }, ...],   // top of rating phase
//         losses:      { "Trinity": [{ seed, lineup, finishedRank }] }  // recent losses per top bot
//       }
//     ]
//   }

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = resolve(HERE, "seasons.json");
const MAX_SEASONS = 50;

async function readStore() {
  try {
    const txt = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(txt);
    if (!parsed || !Array.isArray(parsed.seasons)) return { seasons: [] };
    return parsed;
  } catch (e) {
    if (e.code === "ENOENT") return { seasons: [] };
    throw e;
  }
}

async function writeStore(store) {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export async function loadSeasons() {
  const store = await readStore();
  return store.seasons;
}

export async function saveSeason(entry) {
  const store = await readStore();
  const id = (store.seasons[store.seasons.length - 1]?.id ?? 0) + 1;
  const stamped = { id, savedAt: new Date().toISOString(), ...entry };
  store.seasons.push(stamped);
  if (store.seasons.length > MAX_SEASONS) {
    store.seasons.splice(0, store.seasons.length - MAX_SEASONS);
  }
  await writeStore(store);
  return stamped;
}

export async function loadLatestSeason() {
  const seasons = await loadSeasons();
  return seasons[seasons.length - 1] ?? null;
}

export function getSeasonStorePath() {
  return STORE_PATH;
}
