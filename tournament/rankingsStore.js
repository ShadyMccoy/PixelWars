// File IO for tournament/rankings.json — the global Plackett-Luce ranking
// produced by tournament/rank.js and consumed by the league runner (to seed
// tier composition) and the browser UI (to render rankings).
//
// File shape:
//   { generatedAt, matchCount, iterations, converged,
//     players: [{ name, rating, skill, matches, wins, avgFinish }, ...] }

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RANKINGS_PATH = resolve(HERE, "rankings.json");

export function getRankingsPath() {
  return RANKINGS_PATH;
}

export async function loadRankings() {
  try {
    const txt = await readFile(RANKINGS_PATH, "utf8");
    const parsed = JSON.parse(txt);
    if (!parsed || !Array.isArray(parsed.players)) return null;
    return parsed;
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

export async function saveRankings(rankings) {
  await mkdir(dirname(RANKINGS_PATH), { recursive: true });
  await writeFile(RANKINGS_PATH, JSON.stringify(rankings, null, 2) + "\n", "utf8");
}

// Convenience: { name -> rating } map. Bots missing from rankings get
// `defaultRating` (the median 1000 by default) so new bots slot mid-pack.
export function ratingMap(rankings, defaultRating = 1000) {
  const out = new Map();
  if (rankings?.players) {
    for (const p of rankings.players) out.set(p.name, p.rating);
  }
  return {
    get: (name) => (out.has(name) ? out.get(name) : defaultRating),
    has: (name) => out.has(name),
  };
}
