// Persistence for league standings — the per-map list of tiers + their
// composition that the browser fetches to show "Watch top tier" widgets.
//
// File: tournament/leagues.json with shape:
//   { leagues: [ { map, mapConfig, savedAt, tierSize, seasons, ..., tiers }, ... ] }
//
// One entry per map preset (last write wins for that map). Browser-side a
// future localStorage-backed adapter would expose the same load/save API.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = resolve(HERE, "leagues.json");

async function readStore() {
  try {
    const txt = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(txt);
    if (!parsed || !Array.isArray(parsed.leagues)) return { leagues: [] };
    return parsed;
  } catch (e) {
    if (e.code === "ENOENT") return { leagues: [] };
    throw e;
  }
}

async function writeStore(store) {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export async function loadLeagues() {
  const store = await readStore();
  return store.leagues;
}

export async function saveLeague(entry) {
  const store = await readStore();
  const stamped = { savedAt: new Date().toISOString(), ...entry };
  const idx = store.leagues.findIndex((l) => l.map === entry.map);
  if (idx >= 0) store.leagues[idx] = stamped;
  else store.leagues.push(stamped);
  await writeStore(store);
  return stamped;
}

export function getLeagueStorePath() {
  return STORE_PATH;
}
