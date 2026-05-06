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
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const DEFAULT_AGENT_CMD = "claude -p";

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
function runCmd(cmd, args, { input = null, captureStdout = false, captureStderr = false, env } = {}) {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn(cmd, args, {
      cwd: REPO_ROOT,
      env: env ?? process.env,
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

async function runSeason(seasonArgs) {
  const args = ["tournament/run.js", "--season"];
  if (seasonArgs.trim()) args.push(...seasonArgs.trim().split(/\s+/));
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
  const nameMatch = filepath.match(/([^/]+)\.js$/);
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
  await runCmd(bin, args, { input: fullPrompt });
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
