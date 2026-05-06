# PixelWars in the Bitter-verse

How this project fits into the Bitter ecosystem's role map (the "Bitter Atlas").
This is an orientation doc, not a roadmap. It records the durable role PixelWars
plays in the larger system so future contributors and agents can recognize
what's load-bearing and what's incidental.

If you don't know what the Bitter Atlas is: it's the ten-year role map for a
constellation of agent-built software properties. Each property has a charter
that says what primitive it owns, what truth it's allowed to make reliable,
what it must refuse to become, and how it makes the rest of the fleet smarter,
safer, cheaper, or more useful. PixelWars is one of those properties.

## Layer and role

- **Layer**: portfolio properties → games cluster (low-maintenance, static,
  interactive)
- **Surface role**: portfolio property
- **Atlas maturity**: prototype / private-live (it runs, has a domain, no
  external adjudication yet)
- **Allocation posture**: `harvest` today; candidate for `invest` once the
  bot-uploads roadmap ships and the agent-curriculum loop is live

## What PixelWars actually owns

- **Owned primitive**: bot strategy contract, deterministic rules engine,
  seeded match, replay record, league/tier state, "interesting match" auto-flag
- **Truth owned**: given a lineup + seed + map + tech loadout, this is the
  canonical match outcome and standings. Replay records are reconstructable
  from their own contents — they survive code churn.
- **Truth not owned**: pedagogical claims about strategy, real-world game
  theory, account/identity, persistent player state, monetization, anything
  that requires a backend.

## What it must refuse to become

- Not a platform primitive. Don't let it grow into infrastructure other Bitter
  properties depend on.
- Not a generic eval product. Comparative inference belongs to BitterBench;
  live behavior verification belongs to BitterQA. PixelWars ranks
  *game strategies under stated rules*, which is its own thing.
- Not a marketplace, not a social/multiplayer platform, not a real-time game
  service.
- No accounts, no backend, no secrets — until evidence demands them, and even
  then prefer consuming a Bitter satellite over inventing one-off
  infrastructure.

## Two lanes (orthogonal)

PixelWars has — or will have, once the bot-uploads roadmap lands — two
strictly separate lanes. The distinction is doctrinal, not cosmetic.

### Local lane

A developer or agent iterates on a bot fully in-browser:

- paste-and-run from a textarea
- File System Access API ("watch this folder, hot-reload as I save") for
  serious authoring
- drag-and-drop for one-shot trials

This lane has no network, no account, no PR, and no trust burden — the bot
only runs in the author's own tab. It's already maximally local-first. It
doesn't need the sandbox to be safe; the sandbox is defense-in-depth here.

### Publication lane

A bot becomes visible to *other* visitors:

- PR to `src/strategies/submissions/`
- CI gates: lint, module shape, smoke match, quality floor
- auto-merge on green
- league quarantine tier on first appearance
- promotion through normal season play

This lane carries the trust burden because merged bots auto-load in
strangers' browsers. The browser sandbox + CI gates + quarantine tier are
load-bearing here. See [bot-uploads-roadmap.md](./bot-uploads-roadmap.md).

The two lanes share a runtime (the deterministic rules engine) but should
stay visibly distinct in the UI. "I'm trying my bot" is a different verb
from "I'm publishing my bot."

## How PixelWars compounds the rest of Bitter

This is the part that justifies investment beyond "it's fun":

- **Agent-curriculum loop**: one file per bot, deterministic outcomes, league
  ranking. A Factory-allocated agent can author a strategy, the league
  settles whether it earned its tokens, and the replay record survives the
  agent's context window. That's a complete receipt chain on free
  infrastructure.
- **Receipt doctrine in miniature**: PR → static lint → smoke match →
  quality floor → quarantine → tier promotion → interesting-match flag →
  replay record. Maps cleanly onto the atlas's
  `invocation receipt → evidence handle → settlement → allocation`
  chain.
- **Capability-profile rehearsal**: the layered browser sandbox (null-origin
  iframe → Module Worker → throwing global stubs → meta-CSP → per-tick
  wallclock) is the same shape as BitterPass's "narrow + TTL + one-shot +
  revoke" doctrine, applied to JS execution instead of credentials.
- **Static-distribution probe**: hardens custom-domain serving, deploy/preview
  posture, and SEO under a real interactive property.
- **Adversarial-input substrate**: untrusted JS at scale, with public CI logs
  and no secrets, is concrete adjacent territory to the reserved
  `bitterhat.com` primitive (scoped adversarial validation).

## Atlas seams (don't absorb them; map onto them)

When a roadmap concern starts to grow, route it to the right Bitter layer
rather than building it inline.

| Concern | Atlas home | When |
| --- | --- | --- |
| Untrusted JS execution + sandbox-bypass evidence | `bitterhat.com` (reserved) | If/when adversarial validation becomes a customer-grade primitive elsewhere |
| Per-author rate limits, slop filtering, abuse caps | Bitterscreen | When manual rate-limit code starts growing |
| AI security review at the merge gate | Claude API + BitterPass for the key | The roadmap's deferred section is already shaped for this |
| Smoke match + quality floor as release gate | BitterQA contract | When QA matures enough to host non-product release gates |
| Replay records + interesting-match flags | BitterLog | Already content-addressable in spirit; ingest when Log matures |
| `frame-ancestors` / `report-uri` / real CSP headers | Radicchio | When meta-tag CSP becomes load-bearing-insufficient |
| Cross-property author identity | BitterHub | If/when contributing across Bitter-curated bot/eval/utility surfaces becomes a thing — not a v1 concern |

## Tension axes to keep alive

The charter is too weak if any of these collapse to one side:

- correctness vs generation speed
- open contribution vs sandbox correctness
- static-site simplicity vs CSP fidelity
- volume of AI-generated bots vs league signal quality
- browser sandbox vs CI sandbox (defense in depth, but both must fail closed)
- local lane ergonomics vs publication lane trust burden
- evergreen SEO vs maintenance drag

## Invariants

Things that should remain true through any future change:

- Local lane works without network, accounts, or PRs.
- Publication lane is gated and receipted. Doesn't have to be GitHub forever,
  but the receipt chain doesn't get to disappear.
- Browser sandbox stays in front of every user-supplied bot as long as bots
  can run in strangers' tabs.
- Determinism is the property's trust spine. A non-replayable bot poisons
  every receipt downstream of it. Protect replay portability before
  optimizing for anything else.
- No secrets in any environment that runs untrusted code (workflow,
  container, runner image).
- New bots are quarantined before reaching visible league rankings.
- Removal-is-tombstone, not delete. In an append-only-receipt world, replay
  links must keep resolving.

## Removal test

If PixelWars disappears, the portfolio still has games and static surfaces.
What's lost is the cleanest substrate for "agent writes a self-contained
strategy file under hostile-input assumptions, deterministic competition
ranks it, replay receipts survive code churn, and the whole loop runs on
free infrastructure." That's the receipt-and-sandbox doctrine running
end-to-end in a place small enough to reason about. That's the curriculum
gap.

## Source pointers

- [README.md](../README.md) — what PixelWars is and how to run it
- [docs/strategies.md](./strategies.md) — the bot-author guide
- [docs/bot-uploads-roadmap.md](./bot-uploads-roadmap.md) — the publication
  lane plan and threat model
- [docs/map-search.md](./map-search.md) — automated map-quality search
- [docs/techs.md](./techs.md) — tech loadout system
