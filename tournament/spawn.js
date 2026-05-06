// Descendant spawn scaffolding. Two halves:
//
//   prepareSpawnTask(parent, ctx)  →  prompt + suggested filename
//      Reads the parent strategy file and the parent's recent losses,
//      builds an "improve this bot one tiny bit" prompt for an LLM
//      agent. The agent is supposed to emit a single new strategy file,
//      a small variation of the parent.
//
//   registerDescendant({ name, parent, filePath, birthSeason })
//      Once the agent has produced the file, this wires it into:
//        - src/strategies/descendants.js (the auto-managed registry)
//        - tournament/lineages.json (the lineage record)
//      The descendant becomes a first-class bot in the next tournament.

import { readFile, writeFile, copyFile, access } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { addDescendant, loadLineages, markArchived } from "./lineageStore.js";
import { loadLatestSeason } from "./seasonStore.js";
import { writeArchive, ARCHIVE_PATH } from "./archiveFile.js";

export const DEFAULT_FAMILY_CAP = 3;
const ASSUMED_RATING = 1500; // for bots without a rating yet (e.g. fresh founders)

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const STRATEGIES_DIR = resolve(REPO_ROOT, "src", "strategies");
const DESCENDANTS_REGISTRY = resolve(STRATEGIES_DIR, "descendants.js");
const DOCS_DIR = resolve(REPO_ROOT, "docs");
const MAX_WINNER_SOURCES = 3;

// Try a few likely paths for the parent's source. Most bots live as
// `src/strategies/<Name>.js`; descendants are also there. Returns null
// if the bot is registered (e.g. via factory in generated.js) but has
// no dedicated file — those need a different prompt path.
async function findParentSource(parentName) {
  const direct = resolve(STRATEGIES_DIR, `${parentName}.js`);
  try {
    await access(direct);
    const src = await readFile(direct, "utf8");
    return { path: direct, source: src };
  } catch {
    return null;
  }
}

function shortId() {
  // 6 random hex chars; enough to avoid collisions for hundreds of
  // descendants and short enough to keep filenames readable.
  return Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
}

// Pick a unique name for the descendant: <Family>_g<N>_<shortid>.
async function suggestDescendantName(parent, lineages) {
  const parentRec = lineages.find((b) => b.name === parent);
  if (!parentRec) throw new Error(`Parent "${parent}" has no lineage record`);
  const family = parentRec.family;
  const gen = parentRec.generation + 1;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${family}_g${gen}_${shortId()}`;
    if (!lineages.some((b) => b.name === candidate)) return candidate;
  }
  throw new Error("Could not find a unique descendant name after 10 tries");
}

export async function prepareSpawnTask(parentName, { lossLimit = 5 } = {}) {
  const lineages = await loadLineages();
  const parentRec = lineages.find((b) => b.name === parentName);
  if (!parentRec) {
    throw new Error(`No lineage record for "${parentName}". Run --backfill-lineages first.`);
  }

  const parentSrc = await findParentSource(parentName);
  if (!parentSrc) {
    throw new Error(
      `No source file found at src/strategies/${parentName}.js. ` +
      `Bots defined via the factory (Hunter_01, etc.) cannot yet be spawned ` +
      `from — pick a parent with its own strategy file.`,
    );
  }

  const newName = await suggestDescendantName(parentName, lineages);
  const suggestedFilePath = resolve(STRATEGIES_DIR, `${newName}.js`);

  // Pull recent loss context from the latest saved season, if it
  // mentions this parent. Otherwise fall back to a no-context note.
  const season = await loadLatestSeason();
  const losses = (season?.losses?.[parentName] ?? []).slice(0, lossLimit);

  // Source files of bots that beat the parent — the agent can read
  // these to think about counters. Skips factory-generated bots that
  // don't have their own .js file.
  const winnerSources = await collectWinnerSources(losses, parentName);

  // Map config the parent was actually rated on. Numbers like growth
  // and wrap matter for tuning constants like commitment fractions.
  const mapInfo = season ? {
    name: season.map ?? null,
    config: season.mapConfig ?? null,
  } : null;

  // Engine docs — the agent has no way to discover the API otherwise.
  const docs = await loadDocs();

  const prompt = buildPrompt({
    parentName,
    newName,
    parentSource: parentSrc.source,
    parentPath: parentSrc.path,
    losses,
    winnerSources,
    mapInfo,
    docs,
    seasonId: season?.id ?? null,
  });

  return {
    newName,
    parentName,
    parentPath: parentSrc.path,
    suggestedFilePath,
    prompt,
    losses,
  };
}

async function loadDocs() {
  const out = {};
  for (const name of ["strategies.md", "engine-api.md"]) {
    try {
      out[name] = await readFile(resolve(DOCS_DIR, name), "utf8");
    } catch {
      out[name] = null;
    }
  }
  return out;
}

// Walk recent losses, dedupe winners (skipping the parent and any
// duplicates), and load source for each whose strategy has a dedicated
// file. Factory-generated bots (Hunter_01, Pulse_05, etc.) don't have
// their own files — those get listed by name only.
async function collectWinnerSources(losses, parentName) {
  const seenNames = new Set();
  const withSource = [];
  const namesOnly = [];
  for (const L of losses) {
    const w = L.winner;
    if (!w || w === parentName) continue;
    if (seenNames.has(w)) continue;
    seenNames.add(w);
    const path = resolve(STRATEGIES_DIR, `${w}.js`);
    try {
      await access(path);
      if (withSource.length < MAX_WINNER_SOURCES) {
        const src = await readFile(path, "utf8");
        withSource.push({ name: w, source: src, path });
        continue;
      }
    } catch { /* fall through to names-only */ }
    namesOnly.push(w);
  }
  return { withSource, namesOnly };
}

function buildPrompt({
  parentName, newName, parentSource, parentPath,
  losses, winnerSources, mapInfo, docs, seasonId,
}) {
  const parentRel = parentPath.replace(REPO_ROOT + "/", "");
  const lossSection = losses.length === 0
    ? `(no recent losses recorded — the parent dominated its season)`
    : losses.map((L, i) =>
        `  ${i + 1}. seed=${L.seed} lineup=[${L.lineup.join(", ")}] ` +
        `finished #${L.finishedRank} of ${L.lineup.length} ` +
        `(winner: ${L.winner}, ${L.endReason}, ticks=${L.ticks})`
      ).join("\n");

  const mapSection = mapInfo?.config
    ? `Map: \`${mapInfo.name ?? "?"}\` — ${formatMapConfig(mapInfo.config)}`
    : `(map config not recorded for this season)`;

  const winnerSrcSection = (() => {
    if (!winnerSources) return "";
    const blocks = [];
    for (const w of winnerSources.withSource) {
      const rel = w.path.replace(REPO_ROOT + "/", "");
      blocks.push(`### \`${rel}\` (beat the parent)\n\n\`\`\`js\n${w.source.trim()}\n\`\`\``);
    }
    if (winnerSources.namesOnly.length) {
      blocks.push(
        `### Other winners without dedicated source files\n\n` +
        winnerSources.namesOnly.map((n) => `- \`${n}\` (factory-generated; see \`src/strategies/factory.js\` and \`generated.js\` for shape)`).join("\n"),
      );
    }
    return blocks.length ? `\n## Bots that beat the parent\n\n${blocks.join("\n\n")}\n` : "";
  })();

  const docsSection = (() => {
    const blocks = [];
    if (docs["strategies.md"]) {
      blocks.push(`### \`docs/strategies.md\`\n\n${docs["strategies.md"].trim()}`);
    }
    if (docs["engine-api.md"]) {
      blocks.push(`### \`docs/engine-api.md\`\n\n${docs["engine-api.md"].trim()}`);
    }
    return blocks.length ? `\n## Game / API reference\n\n${blocks.join("\n\n---\n\n")}\n` : "";
  })();

  return `# Spawn descendant: ${newName}

You are creating a small variation of the bot **${parentName}** — its
descendant — in the PixelWars tournament. The task is exactly:

> Improve this bot one tiny bit.

The descendant should be **a small modification** of the parent: tweak a
constant, swap a tiebreaker, refine a heuristic, change the threshold at
which it commits force. Do **not** rewrite from scratch. Do **not** add
new infrastructure. The smaller the change, the better the comparison.

## Test environment

${mapSection}

## Parent source — \`${parentRel}\`

\`\`\`js
${parentSource.trim()}
\`\`\`

## Parent's recent losses${seasonId != null ? ` (season #${seasonId})` : ""}

${lossSection}
${winnerSrcSection}${docsSection}
## Output requirements

1. Produce ONE JavaScript file at \`src/strategies/${newName}.js\`.
2. The file must export a default object with at least \`name\`, plus
   whatever fields the parent strategy uses (typically \`act\`,
   sometimes \`description\`, \`summary\`).
3. The exported \`name\` MUST be \`"${newName}"\` exactly.
4. Keep the change tiny and reviewable. Comment WHY the change is
   expected to help — reference the loss context above when possible.
5. Do not edit any other file. Registration into the engine and
   lineage store happens via:
       \`\`\`
       node tournament/run.js --register-descendant \\
         --name ${newName} --parent ${parentName} \\
         --file src/strategies/${newName}.js
       \`\`\`
`;
}

function formatMapConfig(cfg) {
  const parts = [];
  if (cfg.width != null && cfg.height != null) parts.push(`${cfg.width}×${cfg.height}`);
  if (cfg.growth != null) parts.push(`growth ${cfg.growth}`);
  if (cfg.maxArmy != null) parts.push(`maxArmy ${cfg.maxArmy}`);
  if (cfg.wrap != null) parts.push(cfg.wrap ? "wrap" : "no-wrap");
  return parts.join(", ") || JSON.stringify(cfg);
}

// ---------------------------------------------------------- archival on spawn
//
// Every spawn is zero-sum at the pool level: the globally weakest active
// bot gets archived to make room for the descendant, except when doing
// so would leave the spawning family with zero active members (a family
// can't suicide on a single bad descendant). The family is also capped:
// if the spawn would push the family above the cap, archive the family's
// weakest sibling too.

export async function applyArchivalForSpawn(newBotName, { familyCap = DEFAULT_FAMILY_CAP } = {}) {
  const lineages = await loadLineages();
  const newRec = lineages.find((b) => b.name === newBotName);
  if (!newRec) throw new Error(`No lineage record for "${newBotName}"`);

  const season = await loadLatestSeason();
  const ratings = new Map();
  for (const r of (season?.ratings ?? [])) ratings.set(r.name, r.rating);

  const ratingOf = (name) => ratings.get(name) ?? ASSUMED_RATING;

  // Active = lineage.active === true. The just-registered descendant is
  // active too, but we exclude it from archival candidates (it has no
  // rating yet, and archiving it would defeat the spawn).
  const activeBots = lineages.filter((b) => b.active && b.name !== newBotName);
  const familySiblings = activeBots.filter((b) => b.family === newRec.family);

  const decisions = [];

  // Global weakest, with family-suicide guard: if the weakest belongs to
  // the spawning family AND is its only active sibling, skip and try the
  // next weakest. After archival, the family must still have ≥ 1 member
  // (excluding the new bot, which is exempt).
  const sorted = activeBots.slice().sort((a, b) => ratingOf(a.name) - ratingOf(b.name));
  for (const cand of sorted) {
    if (cand.family === newRec.family && familySiblings.length <= 1) continue;
    decisions.push({ name: cand.name, reason: "global-weakest-on-spawn", rating: ratingOf(cand.name) });
    break;
  }

  // Family cap: count includes the new bot. If exceeds cap, archive the
  // weakest sibling — but skip if already chosen above.
  const familyCount = familySiblings.length + 1;
  if (familyCount > familyCap) {
    const sortedSiblings = familySiblings.slice().sort((a, b) => ratingOf(a.name) - ratingOf(b.name));
    for (const cand of sortedSiblings) {
      if (decisions.some((d) => d.name === cand.name)) continue;
      decisions.push({ name: cand.name, reason: "family-cap", rating: ratingOf(cand.name) });
      break;
    }
  }

  for (const d of decisions) {
    await markArchived(d.name);
  }
  if (decisions.length > 0) {
    // Union the lineage-derived archived names with whatever is already
    // in archive.js. Manual --archive-add entries don't flip the
    // lineage active flag, so we'd otherwise clobber them on every
    // spawn. archive.js is the source of truth for STRATEGY_LIST
    // filtering; lineage.active is auxiliary.
    const existing = await readExistingArchive();
    const post = await loadLineages();
    const fromLineage = post.filter((b) => !b.active).map((b) => b.name);
    const merged = [...new Set([...existing, ...fromLineage])];
    await writeArchive(merged);
  }

  return decisions;
}

// Parse the names out of src/strategies/archive.js without importing
// it (avoids ESM module-cache staleness when spawning multiple
// descendants in one process).
async function readExistingArchive() {
  try {
    const txt = await readFile(ARCHIVE_PATH, "utf8");
    const m = txt.match(/export const ARCHIVED\s*=\s*\[([\s\S]*?)\]/);
    if (!m) return [];
    const out = [];
    const re = /"([^"]+)"|'([^']+)'/g;
    let mm;
    while ((mm = re.exec(m[1])) !== null) out.push(mm[1] ?? mm[2]);
    return out;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------- registration

export async function registerDescendant({ name, parent, filePath, birthSeason = null, familyCap = DEFAULT_FAMILY_CAP }) {
  // Validate the file exists and the bot loads correctly.
  const absPath = resolve(filePath);
  await access(absPath);
  const mod = await import(absPath);
  if (!mod.default) {
    throw new Error(`${absPath} must default-export a strategy object`);
  }
  if (mod.default.name !== name) {
    throw new Error(
      `Strategy file's name field is "${mod.default.name}", expected "${name}". ` +
      `Either fix the file or pass --name "${mod.default.name}".`,
    );
  }
  if (typeof mod.default.act !== "function") {
    throw new Error(`${absPath}: exported strategy must have an 'act' function`);
  }

  // Move the file into src/strategies/ if it isn't already there.
  const targetPath = resolve(STRATEGIES_DIR, `${name}.js`);
  if (absPath !== targetPath) {
    await copyFile(absPath, targetPath);
  }

  // Append to descendants.js registry. This file is auto-managed —
  // we rewrite it deterministically each time so the import order is
  // alphabetical & stable.
  await rewriteDescendantsRegistry(await collectDescendantNames(name));

  // Record lineage. addDescendant validates parent exists and bumps
  // generation.
  const rec = await addDescendant({ name, parent, birthSeason });

  // Population control: archive the globally weakest active bot, plus
  // any family-cap overflow. Skipped silently when no season has run yet
  // (no ratings to compare).
  const archived = await applyArchivalForSpawn(name, { familyCap });

  return { name, parent, filePath: targetPath, lineage: rec, archived };
}

async function collectDescendantNames(extra) {
  const lineages = await loadLineages();
  const names = new Set(
    lineages.filter((b) => b.parent != null).map((b) => b.name),
  );
  if (extra) names.add(extra);
  return [...names].sort();
}

async function rewriteDescendantsRegistry(names) {
  const imports = names
    .map((n) => `import ${quoteSafeIdent(n)} from "./${n}.js";`)
    .join("\n");
  const list = names.map((n) => `  ${quoteSafeIdent(n)},`).join("\n");
  const body =
`// Auto-managed registry of descendant bots produced by the genetic-spawn
// system. Each descendant lives in its own file under src/strategies/,
// named like \`<Family>_g<N>_<shortid>.js\`. This file is rewritten by
// \`tournament/run.js --register-descendant\` — hand edits will be
// overwritten the next time a descendant is registered.
${imports ? "\n" + imports + "\n" : ""}
export const DESCENDANTS = [
${list}
];
`;
  await writeFile(DESCENDANTS_REGISTRY, body, "utf8");
}

// JS identifiers can't start with a digit and can't contain special
// chars. Descendant names use only [A-Za-z0-9_], so they're already
// safe — but guard anyway in case a future naming scheme breaks the
// invariant.
function quoteSafeIdent(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Cannot import "${name}" — not a valid JS identifier`);
  }
  return name;
}
