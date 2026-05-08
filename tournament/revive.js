// Revive (un-archive) older bots. Symmetric to cull.js: pulls archived
// gen-0 founders back into the active pool to restore family diversity
// after a kinship cull leaves the pool dominated by one family's
// descendants.
//
// Default scope is "named originals": gen-0 archived bots whose name
// has no underscore. That filter excludes factory parameter-sweep
// batches (Hunter_01..10, Pacifist_*, Drift_*, etc.) which are
// intentionally repetitive and would re-bloat the pool with low
// kinship diversity. Pass `includeFactory: true` to revive those too.

import { loadLineages } from "./lineageStore.js";
import { writeFile } from "node:fs/promises";
import { ARCHIVED_STRATEGY_LIST } from "../src/strategies/index.js";
import { writeArchive } from "./archiveFile.js";
import { getLineageStorePath } from "./lineageStore.js";
import { readFile } from "node:fs/promises";

// Named originals heuristic: gen-0 founders whose name contains no
// underscore. Factory bots (Hunter_01, Drift_E, Pacifist_05, …) all
// embed an underscore by convention, while hand-authored ones don't.
function isNamedOriginal(rec) {
  return rec.generation === 0 && !rec.name.includes("_");
}

export async function prepareRevive({ count, includeFactory = false } = {}) {
  const bots = await loadLineages();
  const archived = bots.filter((b) => !b.active);

  let candidates = archived.filter((b) => b.generation === 0);
  if (!includeFactory) {
    candidates = candidates.filter(isNamedOriginal);
  }

  // Older first by createdAt; stable tie-break by name.
  candidates.sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name),
  );

  const target = Number.isFinite(count)
    ? Math.max(0, Math.min(count, candidates.length))
    : candidates.length;
  const revive = candidates.slice(0, target);
  const skipped = candidates.slice(target);

  return {
    revive,
    skipped,
    totalArchived: archived.length,
    pool: includeFactory ? "all gen-0" : "named originals (no factory bots)",
  };
}

// Flip lineage.active back to true for each revived bot and remove it
// from src/strategies/archive.js. Inverse of cull.applyCull.
export async function applyRevive(plan) {
  if (!plan?.revive?.length) return [];
  const names = plan.revive.map((b) => b.name);

  // Update lineage records.
  const path = getLineageStorePath();
  const txt = await readFile(path, "utf8");
  const store = JSON.parse(txt);
  const targets = new Set(names);
  for (const rec of store.bots) {
    if (targets.has(rec.name)) {
      rec.active = true;
      rec.archivedAt = null;
      delete rec.archivedSeason;
    }
  }
  await writeFile(path, JSON.stringify(store, null, 2) + "\n", "utf8");

  // Update archive.js: drop revived names from the existing list.
  const existing = ARCHIVED_STRATEGY_LIST.map((s) => s.name);
  const remaining = existing.filter((n) => !targets.has(n));
  await writeArchive(remaining);

  return names;
}
