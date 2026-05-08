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
import { fileURLToPath, pathToFileURL } from "node:url";
import { addDescendant, loadLineages, markArchived } from "./lineageStore.js";
import { loadLatestSeason } from "./seasonStore.js";
import { writeArchive, ARCHIVE_PATH } from "./archiveFile.js";
import { CHARACTER_TECHS } from "../src/strategies/characterTechs.js";
import { getStrategy } from "../src/strategies/index.js";
import { NEUTRAL_TECH } from "../src/core/Tech.js";

const ASSUMED_RATING = 1500; // for bots without a rating yet (e.g. fresh founders)

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const STRATEGIES_DIR = resolve(REPO_ROOT, "src", "strategies");
const DESCENDANTS_REGISTRY = resolve(STRATEGIES_DIR, "descendants.js");
const MAX_WINNER_SOURCES = 3;

// Find or synthesize the parent's source. Most bots live as
// `src/strategies/<Name>.js`. Factory-generated bots (Pacifist_NN,
// Hunter_NN, etc.) share their implementation via factory.js's
// makeBot/makeStencilBot helpers and have no dedicated file — for those
// we synthesize a one-off source string so the spawn agent has the
// parent's exact config to riff off. Returns null only when the bot is
// genuinely missing (no file AND no factory stamp).
async function findParentSource(parentName) {
  const direct = resolve(STRATEGIES_DIR, `${parentName}.js`);
  try {
    await access(direct);
    const src = await readFile(direct, "utf8");
    return { path: direct, source: src, synthesized: false };
  } catch { /* fall through to synthesis */ }

  let strat;
  try { strat = getStrategy(parentName); }
  catch { return null; }
  if (!strat?._factoryKind || !strat?._factoryConfig) return null;

  const source = synthesizeFactorySource(parentName, strat._factoryKind, strat._factoryConfig);
  return {
    path: resolve(STRATEGIES_DIR, `${parentName}.factory.js`),
    source,
    synthesized: true,
  };
}

function synthesizeFactorySource(name, kind, cfg) {
  // Pretty-print: cfg values are scalars/strings/arrays of numbers, so
  // JSON.stringify round-trips cleanly. The descendant author is told NOT
  // to just call the same factory helper with tweaked args — the whole
  // point of spawning from a factory bot is to leave the factory's
  // constrained interface and write real strategy code.
  const cfgJson = JSON.stringify(cfg, null, 2);
  return `// Synthesized source for factory bot "${name}".
//
// This bot was instantiated from src/strategies/generated.js via
// factory.js's ${kind}() helper — there is no real ${name}.js file.
// The config below is exactly what the running bot uses.
//
// As a descendant author: do NOT just call ${kind} again with tweaked
// args. Write a real strategy file (see e.g. src/strategies/Conqueror.js
// for shape) so future descendants can iterate further. The factory's
// parameter space is intentionally constrained; a real .js file lets
// you encode logic the factory can't express.

import { ${kind} } from "./factory.js";

export default ${kind}(${cfgJson});
`;
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
      `No source file found at src/strategies/${parentName}.js, ` +
      `and no factory config to synthesize from. Pick a real bot.`,
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

  // Parent's character tech (if any). Without this in the prompt, the
  // spawn agent has no way to know that tech is a tunable axis - it
  // defaults to inheriting the parent's allocation via spread.
  // Resolution: prefer .tech on the loaded strategy default-export
  // (covers descendants and most hand-authored bots), then the
  // CHARACTER_TECHS map (covers factory bots and a few hand-authored
  // ones like Settler), then neutral. Reading from CHARACTER_TECHS
  // first was wrong: descendants aren't in that map, so the prompt
  // claimed every Conqueror_gN parent ran neutral 20/20/20/20/20 even
  // when its source file said move:90. The agents reconciled by
  // reading tech off the source code, but the dedicated section was
  // silently misleading and probably suppressed tech exploration.
  let parentTech;
  try {
    const loaded = getStrategy(parentName);
    parentTech = loaded?.tech ?? CHARACTER_TECHS[parentName] ?? { ...NEUTRAL_TECH };
  } catch {
    parentTech = CHARACTER_TECHS[parentName] ?? { ...NEUTRAL_TECH };
  }

  const prompt = buildPrompt({
    parentName,
    newName,
    parentSource: parentSrc.source,
    parentPath: parentSrc.path,
    parentTech,
    losses,
    winnerSources,
    mapInfo,
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
  parentName, newName, parentSource, parentPath, parentTech,
  losses, winnerSources, mapInfo, seasonId,
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

  const docsSection =
`\n## Game / API reference

Read these only if you need them — most tweaks won't:

- \`docs/strategies.md\` — bot file shape, \`act(army, game)\` contract, helpers
- \`docs/engine-api.md\` — fields you can read on \`army\`, \`tile\`, \`player\`, \`game\`
- \`docs/techs.md\` — tech knob slopes and effects
`;

  const techSection = parentTech
    ? `\n## Parent's character tech\n\nThe parent currently runs:\n\n` +
      `\`\`\`json\n${JSON.stringify(parentTech, null, 2)}\n\`\`\`\n\n` +
      `Tech allocates 100 points across {move, stack, prod, atk, def}; ` +
      `each knob shifts a per-turn multiplier (move = garrison floor, ` +
      `others = output multipliers). The descendant can override this ` +
      `by adding a \`tech\` field to the exported object — see ` +
      `\`docs/techs.md\` for slopes and effects. Inheriting via spread ` +
      `from the parent keeps the parent's tech; adding \`tech: { ... }\` ` +
      `replaces it.\n\n` +
      `**Tech is historically under-explored in this lineage.** Past ` +
      `descendants overwhelmingly preserve the parent's tech and tune ` +
      `only strategy code, which means there is little synergy between ` +
      `the two: a move-heavy tech runs strategies that don't actually ` +
      `exploit movement, and an attack-focused strategy runs on tech ` +
      `that doesn't amplify its kills. If your descendant's strategy ` +
      `change leans on a particular axis (more aggression, more ` +
      `expansion, more defense), consider re-allocating tech to match — ` +
      `that's a free 10-15% multiplier on the relevant per-turn output ` +
      `that nobody is currently claiming.\n`
    : "";

  return `# Spawn descendant: ${newName}

You are creating a descendant of **${parentName}** in the PixelWars
tournament. This is one step in a long hill-climb: many short
iterations, each measured by a tournament season. Tournament data is
the validator — your job is to make ONE small, hypothesis-driven change
that you expect to nudge the rating up, not to reinvent the bot.

Guidelines:
- Pick one targeted change: tune a constant, swap a small branch,
  re-allocate tech, etc. Resist whole-thesis rewrites.
- State the hypothesis in a brief comment ("expect this to help against
  X because Y" — reference the loss context below when relevant).
- Don't read the docs unless you actually need a field or helper you
  can't infer from the parent source. Don't run extra greps or tests
  before writing — the season will tell you if you were right.
- File must be self-contained, default-export a working strategy with
  the right \`name\`, and not break the engine API.

## Test environment

${mapSection}

## Parent source — \`${parentRel}\`

\`\`\`js
${parentSource.trim()}
\`\`\`

## Parent's recent losses${seasonId != null ? ` (season #${seasonId})` : ""}

${lossSection}
${techSection}${winnerSrcSection}${docsSection}
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
// can't suicide on a single bad descendant).

export async function applyArchivalForSpawn(newBotName) {
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

export async function registerDescendant({ name, parent, filePath, birthSeason = null }) {
  // Validate the file exists and the bot loads correctly.
  const absPath = resolve(filePath);
  await access(absPath);
  const mod = await import(pathToFileURL(absPath).href);
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

  // Population control: archive the globally weakest active bot.
  // Skipped silently when no season has run yet (no ratings to compare).
  const archived = await applyArchivalForSpawn(name);

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
