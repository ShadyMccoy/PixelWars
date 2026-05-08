#!/usr/bin/env node
// Autonomous descendant-spawn loop. No human in the loop.
//
// Each iteration:
//   1. Run a season (--season). Champions get persisted to seasons.json.
//   2. For every champion, capture the --prepare-spawn prompt and pipe
//      it to the configured agent (default: `claude -p`). The agent is
//      expected to write a single new strategy file at the path
//      embedded in the prompt.
//   3. --register-descendant the new file, which auto-archives the
//      globally weakest bot and applies the family cap.
//
// Usage:
//   node tournament/loop.js                          # 1 iteration
//   node tournament/loop.js --iterations 5
//   node tournament/loop.js --season-args "--matches 100 --pool 5"
//   node tournament/loop.js --dry-run                # plan only, no agent
//   PIXELWARS_AGENT_CMD="claude -p" node tournament/loop.js
//
// Failure modes are non-fatal: if one spawn errors (agent timeout, file
// not written, registration fails), we log it and move on to the next
// champion. The next iteration's season will reflect whatever made it
// in.

import { spawn } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const DEFAULT_AGENT_CMD = "claude -p";

// Auto-matches: scale rating-phase match count to the active pool's
// uncertainty deficit, so quiet iterations (few new/uncertain bots) run
// short seasons and noisy ones (many fresh descendants) run long. Each
// bot below FLOOR_PLAYED contributes (FLOOR_PLAYED - played) to the
// deficit; sum across active bots = total matches the info-gain
// matchmaker needs to drive every uncertain bot to the floor.
const FLOOR_PLAYED = 100;
const AUTO_MIN_MATCHES = 30;
const AUTO_MAX_MATCHES = 1000;

// Pool narrowing: each season runs on (top N rated) ∪ (random K from
// outside the top N) ∪ (all unrated active bots). Wildcards are
// re-rolled every iteration so the long tail rotates through over time
// rather than running every season on the entire active pool.
const TOP_KEEP = 50;
const RANDOM_WILDCARDS = 10;

const HELP = `Usage: node tournament/loop.js [options]

Autonomous descendant-spawn loop.

Options:
  --iterations N        Run the season→spawn cycle this many times (default: 1)
  --agent-cmd CMD       Command to invoke the spawn agent. The prompt
                        is piped in on stdin. The agent must write the
                        new strategy file at the absolute path embedded
                        in the prompt. Default: "${DEFAULT_AGENT_CMD}"
                        Override with PIXELWARS_AGENT_CMD env var.
  --season-args "..."   Extra args passed through to --season (e.g.
                        "--matches 300 --pool 5 --map lab2").
  --dry-run             Plan only: run the season and print what would
                        be spawned, but don't invoke the agent or
                        register anything.
  --help                Show this help.
`;

function parseArgs(argv) {
  const opts = {
    iterations: 1,
    agentCmd: process.env.PIXELWARS_AGENT_CMD ?? DEFAULT_AGENT_CMD,
    seasonArgs: "",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--iterations": opts.iterations = parseInt(next(), 10); break;
      case "--agent-cmd": opts.agentCmd = next(); break;
      case "--season-args": opts.seasonArgs = next(); break;
      case "--dry-run": opts.dryRun = true; break;
      case "--help": case "-h": console.log(HELP); process.exit(0);
      default:
        console.error(`Unknown option: ${a}`);
        console.error(HELP);
        process.exit(1);
    }
  }
  return opts;
}

// Run a child process. If `input` is set it's piped to stdin. If
// `captureStdout`/`captureStderr` are true those streams are captured
// instead of inherited. Resolves with { stdout, stderr }; rejects on
// non-zero exit.
function runCmd(cmd, args, { input = null, captureStdout = false, captureStderr = false, env, shell = false } = {}) {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn(cmd, args, {
      cwd: REPO_ROOT,
      env: env ?? process.env,
      shell,
      stdio: [
        input != null ? "pipe" : "ignore",
        captureStdout ? "pipe" : "inherit",
        captureStderr ? "pipe" : "inherit",
      ],
    });
    let out = "";
    let err = "";
    if (captureStdout) proc.stdout.on("data", (d) => { out += d.toString(); });
    if (captureStderr) proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("error", rejectP);
    proc.on("close", (code) => {
      if (code !== 0) {
        rejectP(new Error(`${cmd} ${args.join(" ")} exited with code ${code}${err ? "\n" + err : ""}`));
      } else {
        resolveP({ stdout: out, stderr: err });
      }
    });
    if (input != null) {
      proc.stdin.write(input);
      proc.stdin.end();
    }
  });
}

// Random sample without replacement; deterministic only if `rng` is
// passed. Default to Math.random so each loop iteration draws fresh
// wildcards and the tail rotates over time.
function sampleK(arr, k, rng = Math.random) {
  if (arr.length <= k) return arr.slice();
  const pool = arr.slice();
  const out = [];
  for (let i = 0; i < k; i++) {
    const j = Math.floor(rng() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}

// Read rankings.json (post-last-season priors) and decide:
//   - which bots to enter in this season's rating tournament: top N
//     rated + K random wildcards from outside the top + all unrated
//     active bots (new descendants need calibration);
//   - how many rating-phase matches to run, scaled to the pool's
//     uncertainty deficit so quiet iterations run short and noisy ones
//     run long. FLOOR_PLAYED clipped to the narrowed pool — bots that
//     aren't entered don't contribute to the match budget.
async function planSeason() {
  const indexUrl = pathToFileURL(resolve(REPO_ROOT, "src/strategies/index.js")).href + `?bust=${Date.now()}`;
  const stratMod = await import(indexUrl);
  const activeNames = stratMod.STRATEGY_LIST.map((s) => s.name);

  const ratings = new Map();
  const priors = {};
  try {
    const txt = await readFile(resolve(REPO_ROOT, "tournament/rankings.json"), "utf8");
    const data = JSON.parse(txt);
    for (const p of data.players ?? []) {
      ratings.set(p.name, p.rating);
      priors[p.name] = { played: p.matches ?? 0 };
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    // No rankings yet: every active bot is fresh and unrated.
  }

  let pool;
  let topCount = 0;
  let wildcardCount = 0;
  let unratedCount = 0;
  if (ratings.size === 0) {
    // First-ever run: nothing rated yet, run on the full active set.
    pool = activeNames.slice();
    unratedCount = pool.length;
  } else {
    const rated = activeNames.filter((n) => ratings.has(n));
    const unrated = activeNames.filter((n) => !ratings.has(n));
    rated.sort((a, b) => ratings.get(b) - ratings.get(a));
    const top = rated.slice(0, TOP_KEEP);
    const tail = rated.slice(TOP_KEEP);
    const wildcards = sampleK(tail, RANDOM_WILDCARDS);
    pool = [...new Set([...top, ...wildcards, ...unrated])];
    topCount = top.length;
    wildcardCount = wildcards.length;
    unratedCount = unrated.length;
  }

  let deficit = 0;
  let uncertain = 0;
  for (const name of pool) {
    const played = priors[name]?.played ?? 0;
    const d = Math.max(0, FLOOR_PLAYED - played);
    if (d > 0) uncertain++;
    deficit += d;
  }
  const matches = Math.max(AUTO_MIN_MATCHES, Math.min(AUTO_MAX_MATCHES, deficit));
  return {
    pool, matches, uncertain, deficit,
    activeCount: activeNames.length,
    topCount, wildcardCount, unratedCount,
  };
}

async function runSeason(seasonArgs) {
  const userArgs = seasonArgs.trim() ? seasonArgs.trim().split(/\s+/) : [];
  const userSpecifiedMatches = userArgs.includes("--matches");
  const userSpecifiedBots = userArgs.includes("--bots");

  const args = ["tournament/run.js", "--season"];
  if (userArgs.length) args.push(...userArgs);

  if (!userSpecifiedBots || !userSpecifiedMatches) {
    const plan = await planSeason();
    if (!userSpecifiedBots) {
      log(`Pool: ${plan.pool.length} bots ` +
          `(top ${plan.topCount} + ${plan.wildcardCount} wildcards + ${plan.unratedCount} unrated, ` +
          `from ${plan.activeCount} active)`);
      args.push("--bots", plan.pool.join(","));
    }
    if (!userSpecifiedMatches) {
      log(`Auto-matches: ${plan.matches} (deficit=${plan.deficit} across ${plan.uncertain}/${plan.pool.length} uncertain bots)`);
      args.push("--matches", String(plan.matches));
    }
  }

  log(`Running season: node ${args.join(" ")}`);
  await runCmd("node", args);
}

async function readLatestSeason() {
  const txt = await readFile(resolve(REPO_ROOT, "tournament/seasons.json"), "utf8");
  const data = JSON.parse(txt);
  return data.seasons[data.seasons.length - 1];
}

async function prepareSpawn(parent) {
  const r = await runCmd(
    "node",
    ["tournament/run.js", "--prepare-spawn", parent],
    { captureStdout: true, captureStderr: true },
  );
  const prompt = r.stdout;
  const m = r.stderr.match(/Suggested filename:\s*(.+)/);
  if (!m) throw new Error(`Could not parse suggested filename from --prepare-spawn for "${parent}":\n${r.stderr}`);
  const filepath = m[1].trim();
  const nameMatch = filepath.match(/([^/\\]+)\.js$/);
  if (!nameMatch) throw new Error(`Suggested filename has unexpected shape: ${filepath}`);
  return { prompt, filepath, newName: nameMatch[1], parent };
}

async function invokeAgent(agentCmd, prompt, filepath) {
  // Append an explicit ACTION block so the agent writes the file and
  // produces minimal stdout. We don't parse the agent's output — we
  // verify by checking the file exists afterwards.
  const fullPrompt =
`${prompt}

## ACTION

Use your file-writing tool to create exactly one file at this absolute path:

  ${filepath}

Do not write or modify any other files. The file's exported strategy
must have its \`name\` field equal to the descendant name embedded in
the path (the basename without \`.js\`). Once written, exit.
`;
  const parts = agentCmd.split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new Error("agent-cmd is empty");
  const [bin, ...args] = parts;
  log(`Invoking agent: ${agentCmd}`);
  // shell:true so Windows finds .cmd/.bat shims (e.g. claude.cmd) on PATH;
  // Node 20+ refuses to spawn them directly (CVE-2024-27980).
  await runCmd(bin, args, { input: fullPrompt, shell: true });
}

async function registerDescendant({ newName, parent, filepath }) {
  const args = [
    "tournament/run.js", "--register-descendant",
    "--name", newName, "--parent", parent, "--file", filepath,
  ];
  await runCmd("node", args);
}

async function spawnFor(parent, opts) {
  log(`Preparing spawn for "${parent}"`);
  const task = await prepareSpawn(parent);
  log(`  → target: ${task.filepath}`);
  if (opts.dryRun) {
    log(`  → dry run, skipping agent + registration`);
    return;
  }
  await invokeAgent(opts.agentCmd, task.prompt, task.filepath);
  try {
    await access(task.filepath);
  } catch {
    throw new Error(`Agent did not write expected file: ${task.filepath}`);
  }
  log(`  → registering ${task.newName}`);
  await registerDescendant(task, opts);
}

function log(msg) {
  console.log(`[loop] ${msg}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  for (let iter = 1; iter <= opts.iterations; iter++) {
    log(`=== Iteration ${iter} of ${opts.iterations} ===`);
    await runSeason(opts.seasonArgs);
    const season = await readLatestSeason();
    const champions = season.champions ?? [];
    log(`Season #${season.id} → ${champions.length} champion${champions.length === 1 ? "" : "s"}:`);
    for (const c of champions) log(`  ${c.kind}: ${c.name}`);

    let okCount = 0;
    let failCount = 0;
    for (const c of champions) {
      try {
        await spawnFor(c.name, opts);
        okCount++;
      } catch (e) {
        failCount++;
        console.error(`[loop] spawn FAILED for ${c.name}: ${e.message}`);
      }
    }
    log(`Iteration ${iter} done: ${okCount} spawned, ${failCount} failed`);
  }

  log(`All ${opts.iterations} iteration${opts.iterations === 1 ? "" : "s"} complete.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
