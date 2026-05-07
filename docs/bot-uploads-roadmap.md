# Visitor bot uploads — roadmap

A plan for letting site visitors contribute their own bots, captured during
design but not yet executed. Pick this up when ready; the v1 section is what
to build first, the deferred sections are what to add when specific pain
shows up.

## Context and the one-paragraph threat model

PixelWars is a static site (GitHub Pages, no backend) where bots are JS
modules in `src/strategies/`. Today every bot is committed by the
maintainer, so trust is implicit. Once visitors can supply bots, two
trust problems appear: **(a)** untrusted JS will run in *other visitors'*
browsers when they load the site, so the site is responsible for not
attacking its own users; **(b)** at scale, manual review of submissions
doesn't keep up, especially since bots are easy to mass-generate with AI.
The plan below puts a hard browser sandbox between visitor-supplied bots
and the rest of the site — that's the load-bearing piece — and uses
GitHub PRs + auto-merge on green CI as the persistence/curation layer for
the small audience the site has today.

## Decisions already made

- **Persistence is GitHub.** Submissions land as PRs to
  `src/strategies/submissions/`. No backend, no auth, no storage cost.
  This is the explicit tradeoff vs. a one-click upload UX.
- **Official tournament runs in CI.** GitHub Actions re-runs the league
  on the canonical bot set and commits results back. Free for public
  repos and already fast (~3 min for 119 bots).
- **The browser sandbox is non-negotiable on day one.** As soon as bots
  are user-supplied, they run on visitors' machines under our origin.
  Sandboxing is what makes that safe.
- **No human review at the merge gate.** Volume from AI-generated bots
  makes manual review impractical; CI gates merge, the sandbox handles
  safety, and the league system curates by skill.

## Status

The **paste-and-run UI** (v1 step 3) shipped — see
[src/ui/CustomBots.js](../src/ui/CustomBots.js) and
[src/ui/CodeModal.js](../src/ui/CodeModal.js). The pasted module loads
via Blob URL + dynamic `import()` and runs in the engine Web Worker,
session-scoped, single-tab. Constraints (no `import` statements,
required `export default`) are documented in
[docs/strategies.md](./strategies.md#pasting-a-bot-in-the-browser).

The remaining v1 pieces — submissions directory, hardened browser
sandbox (null-origin iframe + worker + global overrides + meta-CSP),
CI validation workflow, and the league quarantine tier — are still
pending. The sandbox is the load-bearing piece before any
*cross-visitor* sharing turns on; until then the paste-and-run flow
only runs a visitor's bot in their own tab.

## v1 — minimum viable upload flow

Build all of this together; each piece depends on the others to be
useful or safe.

### 1. Submissions directory

- New directory `src/strategies/submissions/` for visitor-contributed bots.
- `src/strategies/index.js` auto-includes everything in `submissions/`
  alongside the curated list. Submitted bots show up in the HUD dropdown
  and the tournament pool the same way core bots do.
- One file per bot, same shape as `docs/strategies.md` describes.

### 2. Browser sandbox (load-bearing)

This is the one piece that protects visitors from each other. Layered:

- **Sandboxed iframe with null origin.** Host bots inside
  `<iframe sandbox>` with no `allow-same-origin`. The bot's effective
  origin is `null` — no access to the parent's cookies, storage, or DOM.
- **Web Worker inside the iframe.** Workers have no DOM access by spec.
  Load the bot module via a Blob URL from a Module Worker.
- **Global overrides.** Before the bot's module is imported, override
  `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `Notification`,
  `navigator.sendBeacon`, `importScripts`, `Worker`, `RTCPeerConnection`
  with throwing stubs.
- **CSP on the iframe.** `connect-src 'none'`, `script-src 'self' blob:`,
  no `unsafe-eval`. Belt-and-suspenders against a missed override.
- **postMessage protocol.** Host posts `{tick, gameState}`; worker posts
  back `{action}`. The bot never gets a reference to anything outside
  the worker.
- **Wallclock timeout per tick.** `worker.terminate()` if the bot
  doesn't reply in N ms (start with 50 ms; tune).

Suggested layout:

```
src/sandbox/
  host.js          # parent-side: spawn iframe, bridge postMessage
  iframe.html      # null-origin frame, loads worker.js
  worker.js        # global overrides + bot module loader + tick loop
  overrides.js     # the throwing stubs, kept tiny and audited
```

**Known constraint:** GitHub Pages does not support custom HTTP headers,
so the iframe's CSP must be a `<meta http-equiv="Content-Security-Policy">`
inside `iframe.html` (or set via `srcdoc`). Meta-tag CSP is slightly
weaker than header CSP (no `frame-ancestors`, no `report-uri`) but
sufficient for `connect-src` and `script-src`. If we ever move off Pages,
promote to real headers.

### 3. Paste-and-run UI ✅ shipped

- ⚙ Try-a-bot button in the header opens a modal with a textarea,
  name field, and validation pane. Implemented in
  [src/ui/CustomBots.js](../src/ui/CustomBots.js) and
  [src/ui/CodeModal.js](../src/ui/CodeModal.js).
- On Use-in-match: the textarea contents become a Blob, get loaded
  via dynamic `import()`, validated on the main thread, then
  re-imported inside the engine Web Worker. The bot is seated in
  slot 0 of the next match.
- Session-scoped, single-tab. No persistence layer.
- Still pending: hardened sandbox (this currently runs in the engine
  worker, *not* in a null-origin iframe), and a "Share this bot" PR
  shortcut. Both gate cross-visitor sharing.

### 4. CI validation workflow

`.github/workflows/validate-bot.yml`, on `pull_request` (NOT
`pull_request_target` — that exposes secrets to fork PRs):

- Reject PRs that touch anything outside `src/strategies/submissions/`.
- Static lint (regex is fine for v1) for forbidden tokens: `fetch`,
  `XMLHttpRequest`, `WebSocket`, `EventSource`, `eval`, `Function(`,
  `import(`, `Worker`, `document`, `window`, `globalThis`, `process`,
  `require`, `localStorage`, `sessionStorage`, `indexedDB`. Bypassable
  by motivated attackers — that's fine, the sandbox is what makes it
  safe; the lint is for catching slop and accidents.
- Module loads, default-exports a strategy with the required shape
  (`name`, `act`, etc.).
- Smoke match: run the bot in `tournament/arena.js` for one match
  against a fixed lineup with a fixed seed. Must finish without
  throwing.
- Quality floor: 5 matches vs. `Random`, must win >50%. Filters slop
  before it pollutes the league. Tunable.
- Auto-merge on green; reject with a comment on red.

### 5. Quarantine tier in the league

- New bots enter a designated bottom tier and have to earn promotion
  through normal league play. Mostly already how `tournament/league.js`
  works; make the "newcomers tier" explicit so visible top-tier rankings
  aren't disturbed by submission churn.
- Maintainer override label (`promote-now`) for cases where you want
  to seed a known-strong bot directly.

### File touch list for v1

```
src/strategies/index.js         # auto-include submissions/
src/strategies/submissions/     # new
src/sandbox/                    # new (host, iframe, worker, overrides)
src/ui/                         # paste-and-run panel
index.html, styles.css          # UI hookup
.github/workflows/validate-bot.yml   # new
.github/PULL_REQUEST_TEMPLATE/bot-submission.md   # new
tournament/league.js            # explicit newcomers tier
docs/strategies.md              # add a "submitting a bot" section
```

## Deferred — add when specific pain shows up

Sequenced roughly in the order they're likely to become necessary.

### AI security review at the merge gate

**Trigger:** a submission gets through the static lint that we wish hadn't,
or volume gets high enough that we want a second opinion before merge.

- Workflow calls Claude on the PR diff with a hardened system prompt
  describing the threat model (exfil, DOM access, obfuscation,
  prototype pollution, non-determinism).
- Structured JSON verdict (`approve`/`reject` + reasons), `temperature: 0`,
  pinned model, full request/response logged on the PR.
- **Prompt-injection hardening:** treat the diff as untrusted data, not
  instructions. Reject submissions whose comments or string literals
  contain reviewer-directed language as a separate rule.
- Maintainer label `needs-human` blocks auto-merge regardless of verdict.
- First-time contributors get human review; returning contributors with
  clean track records can be AI-gated. Check
  `pull_request.author_association` plus a maintainer-curated allowlist.

### Rate limits and per-account caps

**Trigger:** someone scripts the PR endpoint or floods submissions.

- Cap PRs-per-author-per-day at the workflow level (close with a comment).
- Cap total submissions-per-author. Stale-bot rotation if needed.
- For paste-and-run, no rate limit needed — it's all client-side.

### Stricter submission formats

**Trigger:** broader audience, or sandbox correctness becomes untenable
to maintain.

Move from "JS module" to one of:

- **Tuned parameters** — `{strategy: "Trinity", params: {...}}`. Trust
  drops to zero, expressiveness to nearly zero. Nice "casual visitor"
  lane to add alongside JS, not as a replacement.
- **Mini-DSL** — small interpreted language with no I/O, capped loops.
  Trust scoped to interpreter correctness. Approachable, debuggable.
- **WASM with capability-restricted imports** — strongest isolation
  with full programming language. Best technical answer if we want
  the JS-upload UX without the JS-upload trust burden. Tradeoff:
  toolchain friction.
- **Neural net weights over a fixed architecture** — separate "ML
  league" lane, not a JS replacement. Requires designing the I/O
  encoding and probably a training harness.

### Server-side runner

**Trigger:** we move off the "GitHub-as-backend" path, e.g. to support
direct uploads with no PR.

- Each match runs in an ephemeral container with `--network none
  --read-only --memory --cpus`, hard wallclock timeout.
- No secrets in the runner image; results return via stdout.
- gVisor/Firecracker only if scale demands it.

### Determinism enforcement on the runner

**Trigger:** flaky tournament results, or a bot that exploits
nondeterminism.

- In the worker/runner, replace `Math.random` and `Date.now`/
  `performance.now` with seeded equivalents driven by `game.rng`.
- Existing bots that call `Math.random()` keep working but are flagged
  as non-replayable.

## Invariants to preserve

Things that must remain true through any future change:

- **Browser sandbox stays in front of every user-supplied bot** as long
  as bots can run in visitors' tabs. Don't let "internal tooling" or
  "preview mode" bypass it.
- **CI runs untrusted code on `pull_request`, never `pull_request_target`.**
  The latter exposes repo secrets to fork PRs.
- **No secrets in any environment that runs untrusted code** —
  workflow, container, runner image. The runner needs nothing
  privileged to do its job.
- **New bots are quarantined before reaching visible league rankings.**
  Even with a loose merge gate, the public face of the league shouldn't
  fluctuate from submission churn.
- **AI review (if/when added) treats the diff as data, not
  instructions.** Comments and strings inside bot files are untrusted
  input to the reviewer.

## Open questions to resolve at execution time

- Where do CSP headers live? GitHub Pages → meta tag only. If we want
  real headers (`frame-ancestors`, `report-uri`), we need a host that
  supports them (Cloudflare Pages, Netlify, custom).
- Should pasted-but-not-submitted bots persist in `localStorage` for
  the visitor, or be ephemeral per session? UX decision; either is safe.
- Smoke-match quality floor — is "beats Random > 50%" the right bar, or
  too lax/too strict? Probably tune empirically once submissions arrive.
- Submission filename collisions — auto-suffix on conflict, or reject?
- Removal policy — what's the process for taking a merged bot down
  (broken, abusive, author request)?
