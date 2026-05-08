// Persistence for bot lineage — the per-bot family/parent/generation
// metadata that will drive the descendant-spawn feature. One record per
// bot, keyed by strategy name.
//
// File: tournament/lineages.json with shape:
//   {
//     bots: [
//       {
//         name:         "Trinity",
//         family:       "Trinity",   // root ancestor's name
//         parent:       null,        // parent bot's name, null for founders
//         generation:   0,           // founder=0, child=1, …
//         birthSeason:  null,        // null for founders, integer otherwise
//         active:       true,        // false once archived (deliverable #5)
//         createdAt:    ISO,
//         archivedAt:   ISO | null,
//       },
//       …
//     ]
//   }
//
// Founders are bots that already existed before the lineage system was
// introduced; they are their own family (`family === name`), have no
// parent, and birthSeason is null. Descendants inherit their parent's
// `family` and bump `generation`.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = resolve(HERE, "lineages.json");

async function readStore() {
  try {
    const txt = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(txt);
    if (!parsed || !Array.isArray(parsed.bots)) return { bots: [] };
    return parsed;
  } catch (e) {
    if (e.code === "ENOENT") return { bots: [] };
    throw e;
  }
}

async function writeStore(store) {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export async function loadLineages() {
  const store = await readStore();
  return store.bots;
}

export function getLineageStorePath() {
  return STORE_PATH;
}

// Idempotent: add records for any names missing from the store as
// founders (gen-0, family=self, parent=null). Returns the list of newly
// added names. Existing records are not touched, even if their data
// looks stale — explicit edits should go through saveLineage.
export async function ensureFoundersForNames(names) {
  const store = await readStore();
  const known = new Set(store.bots.map((b) => b.name));
  const now = new Date().toISOString();
  const added = [];
  for (const name of names) {
    if (known.has(name)) continue;
    store.bots.push({
      name,
      family: name,
      parent: null,
      generation: 0,
      birthSeason: null,
      active: true,
      createdAt: now,
      archivedAt: null,
    });
    added.push(name);
  }
  if (added.length) await writeStore(store);
  return added;
}

// Add a descendant record. Validates that the parent exists. The new
// bot inherits the parent's family and gets generation = parent + 1.
export async function addDescendant({ name, parent, birthSeason }) {
  const store = await readStore();
  if (store.bots.some((b) => b.name === name)) {
    throw new Error(`Bot "${name}" already has a lineage record`);
  }
  const parentRec = store.bots.find((b) => b.name === parent);
  if (!parentRec) {
    throw new Error(`Parent "${parent}" has no lineage record`);
  }
  const rec = {
    name,
    family: parentRec.family,
    parent,
    generation: parentRec.generation + 1,
    birthSeason: birthSeason ?? null,
    active: true,
    createdAt: new Date().toISOString(),
    archivedAt: null,
  };
  store.bots.push(rec);
  await writeStore(store);
  return rec;
}

// Mark a bot archived. Idempotent.
export async function markArchived(name, { season = null } = {}) {
  const store = await readStore();
  const rec = store.bots.find((b) => b.name === name);
  if (!rec) throw new Error(`No lineage record for "${name}"`);
  if (rec.active === false) return rec;
  rec.active = false;
  rec.archivedAt = new Date().toISOString();
  if (season != null) rec.archivedSeason = season;
  await writeStore(store);
  return rec;
}

// Mark a bot active again. Idempotent. Inverse of markArchived: clears
// archivedAt/archivedSeason so applyArchivalForSpawn's lineage-derived
// archive list won't re-archive the bot on the next spawn.
export async function markActive(name) {
  const store = await readStore();
  const rec = store.bots.find((b) => b.name === name);
  if (!rec) return null;
  if (rec.active === true) return rec;
  rec.active = true;
  rec.archivedAt = null;
  delete rec.archivedSeason;
  await writeStore(store);
  return rec;
}

// Tree (kinship) distance between two bots, in edges, via their lowest
// common ancestor. Self = 0; parent/child = 1; siblings = 2; cousins = 4.
// Bots in different families return Infinity. Founders (parent === null)
// terminate the walk; if both founders share the family root by name,
// they're treated as the same node (distance 0 from themselves).
//
// Takes the full bot list so callers can build a name-indexed lookup
// once and reuse it across many pairs.
export function kinshipDistance(aName, bName, bots) {
  if (aName === bName) return 0;
  const byName = bots instanceof Map ? bots : new Map(bots.map((b) => [b.name, b]));
  const a = byName.get(aName);
  const b = byName.get(bName);
  if (!a || !b) return Infinity;
  if (a.family !== b.family) return Infinity;

  // Walk a's chain to root, recording depth-from-a for each ancestor.
  const aChain = new Map();
  let cur = a;
  let depth = 0;
  while (cur) {
    aChain.set(cur.name, depth);
    if (cur.parent == null) break;
    const next = byName.get(cur.parent);
    if (!next) break;
    cur = next;
    depth += 1;
  }

  // Walk b's chain until we hit something in a's chain — that's the LCA.
  cur = b;
  depth = 0;
  while (cur) {
    if (aChain.has(cur.name)) {
      return aChain.get(cur.name) + depth;
    }
    if (cur.parent == null) break;
    const next = byName.get(cur.parent);
    if (!next) break;
    cur = next;
    depth += 1;
  }
  return Infinity;
}

// Group bots by family, return a Map of familyId -> bot records (sorted
// by generation then createdAt). Useful for tree-style displays.
export async function familiesByName() {
  const bots = await loadLineages();
  const fams = new Map();
  for (const b of bots) {
    if (!fams.has(b.family)) fams.set(b.family, []);
    fams.get(b.family).push(b);
  }
  for (const list of fams.values()) {
    list.sort((a, b) =>
      a.generation - b.generation ||
      a.createdAt.localeCompare(b.createdAt),
    );
  }
  return fams;
}
