// Family cull: pick a kinship-diverse subset to keep active and archive
// the rest. Useful when one family (e.g. Conqueror, currently 59 active)
// has bloated to dominate the active pool with near-duplicates.
//
// Selection is farthest-point sampling on the family tree:
//   1. Seed the keep set with the highest-rated active member.
//   2. Iteratively add the active member whose minimum kinship distance
//      to the current keep set is largest. Tie-break by rating desc.
//   3. Stop when |keep| == keepCount.
//
// Result: closely-related siblings and parent/child pairs get pruned
// first; structurally distant branches survive.
//
// Output is a plan; `applyCull` is the side-effect step.

import { loadLineages, kinshipDistance, markArchived } from "./lineageStore.js";
import { loadRankings, ratingMap } from "./rankingsStore.js";
import { writeArchive } from "./archiveFile.js";
import { ARCHIVED_STRATEGY_LIST } from "../src/strategies/index.js";

const ASSUMED_RATING = 1500; // matches spawn.js for un-ranked bots

// Build a plan for culling the named family down to `keepCount` active
// members, preserving kinship diversity. Returns:
//   { family, keep, cull, byName, ratings, totalActive }
// where keep/cull are arrays of bot records ordered by selection /
// elimination. Pure: no side effects on lineage or archive files.
export async function prepareCull({ family, keepCount }) {
  if (!family) throw new Error("prepareCull: family is required");
  const lineages = await loadLineages();
  const rankings = await loadRankings();
  const ratings = ratingMap(rankings, ASSUMED_RATING);

  const byName = new Map(lineages.map((b) => [b.name, b]));
  const active = lineages.filter((b) => b.active && b.family === family);
  if (active.length === 0) {
    throw new Error(`No active members of family "${family}".`);
  }

  const target = Number.isFinite(keepCount)
    ? Math.max(1, Math.min(keepCount, active.length))
    : Math.max(1, Math.ceil(active.length / 2));

  if (target >= active.length) {
    const sorted = active.slice().sort(
      (a, b) => ratings.get(b.name) - ratings.get(a.name) || a.name.localeCompare(b.name),
    );
    return {
      family,
      keep: sorted,
      cull: [],
      byName,
      ratings,
      totalActive: active.length,
      keepCount: target,
      distToKeep: new Map(),
    };
  }

  // Seed: highest-rated active member. Stable tie-break by name.
  const seed = active.slice().sort(
    (a, b) => ratings.get(b.name) - ratings.get(a.name) || a.name.localeCompare(b.name),
  )[0];

  const keep = [seed];
  const keepSet = new Set([seed.name]);
  // Track each remaining bot's minimum distance to the keep set; updated
  // incrementally as keep grows. Distances within a family are bounded
  // by the family's diameter (small ints), so Infinity only shows up if
  // the family tree is somehow disconnected (shouldn't happen).
  const minDist = new Map();
  for (const b of active) {
    if (keepSet.has(b.name)) continue;
    minDist.set(b.name, kinshipDistance(b.name, seed.name, byName));
  }

  while (keep.length < target) {
    let bestName = null;
    let bestDist = -1;
    let bestRating = -Infinity;
    for (const [name, d] of minDist) {
      const r = ratings.get(name);
      if (d > bestDist || (d === bestDist && r > bestRating)) {
        bestName = name;
        bestDist = d;
        bestRating = r;
      }
    }
    if (bestName == null) break;
    const picked = byName.get(bestName);
    keep.push(picked);
    keepSet.add(bestName);
    minDist.delete(bestName);
    // Update every remaining bot's min distance against the new pick.
    for (const [name] of minDist) {
      const d = kinshipDistance(name, bestName, byName);
      if (d < minDist.get(name)) minDist.set(name, d);
    }
  }

  // Cull list: every active member not in keep, ordered by ascending
  // min-distance to keep set (closest kin first — these are the
  // "redundant" picks the farthest-point search rejected). Tie-break by
  // ascending rating so the worst-of-the-redundant rises to the top of
  // the cull list, matching the spirit of `--trim-to`.
  const cull = active.filter((b) => !keepSet.has(b.name));
  // Recompute final min-distance for display (minDist still has the
  // residual values for unselected names, but a few may have lost their
  // entry by being picked; re-derive to be safe).
  const distToKeep = new Map();
  for (const b of cull) {
    let best = Infinity;
    for (const k of keep) {
      const d = kinshipDistance(b.name, k.name, byName);
      if (d < best) best = d;
    }
    distToKeep.set(b.name, best);
  }
  cull.sort((a, b) => {
    const da = distToKeep.get(a.name);
    const db = distToKeep.get(b.name);
    return da - db || ratings.get(a.name) - ratings.get(b.name) || a.name.localeCompare(b.name);
  });

  return {
    family,
    keep,
    cull,
    byName,
    ratings,
    totalActive: active.length,
    keepCount: target,
    distToKeep,
  };
}

// Archive every bot in the cull list — both the lineage record (active
// = false) and src/strategies/archive.js. Mirrors applyArchivalForSpawn
// and cmdTrimTo's pattern: union with the existing archive so manual
// entries and factory bots without lineage records aren't clobbered.
export async function applyCull(plan) {
  if (!plan?.cull?.length) return [];
  for (const b of plan.cull) {
    await markArchived(b.name);
  }
  const existing = ARCHIVED_STRATEGY_LIST.map((s) => s.name);
  const post = await loadLineages();
  const fromLineage = post.filter((b) => !b.active).map((b) => b.name);
  const merged = [...new Set([...existing, ...plan.cull.map((b) => b.name), ...fromLineage])];
  await writeArchive(merged);
  return plan.cull.map((b) => b.name);
}
