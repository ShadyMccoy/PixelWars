// Append-only JSONL log of every tournament match.
//
// File: tournament/matches.jsonl. One JSON object per line. Used by
// tournament/rank.js to fit a global Plackett-Luce ranking.
//
// Entry shape:
//   { ts, map, seed, ticks, endReason,
//     ranking: [{ name, place, eliminatedAt, territory, strength, survived }] }
//
// `name` is the canonical strategy name (matches `strategy.name`). `place`
// is 0 = best, K-1 = worst, matching arena.js's pre-sorted ranking.

import { appendFile, readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES_VERSION } from "../src/core/version.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = resolve(HERE, "matches.jsonl");

export function getMatchLogPath() {
  return LOG_PATH;
}

export function buildMatchEntry({ map, result }) {
  return {
    ts: new Date().toISOString(),
    rulesVersion: RULES_VERSION,
    map,
    seed: result.seed,
    ticks: result.ticks,
    endReason: result.endReason,
    ranking: result.ranking.map((r, place) => ({
      name: r.strategy,
      place,
      eliminatedAt: r.eliminatedAt,
      territory: r.territory,
      strength: r.strength,
      survived: r.survived,
    })),
  };
}

export async function appendMatches(entries) {
  if (!entries.length) return;
  await mkdir(dirname(LOG_PATH), { recursive: true });
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await appendFile(LOG_PATH, lines, "utf8");
}

export async function loadMatches() {
  let txt;
  try {
    txt = await readFile(LOG_PATH, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  const out = [];
  for (const line of txt.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // Skip malformed line; better than failing the whole load.
    }
  }
  return out;
}
