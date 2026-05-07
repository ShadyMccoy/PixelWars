# PixelWars

A tile-based strategy sandbox where AI armies fight for territory using
pluggable bot strategies. Born as a TypeScript/SystemJS prototype,
modernized into a zero-build browser app with a worker-isolated engine
and a headless tournament runner.

## Run it

No build step. No `npm install`. Just serve the directory and open it.

```bash
npm run serve            # python3 -m http.server 8000
# or
npx --yes serve .
```

Then visit <http://localhost:8000>.

## What you see

The browser app is one screen, three columns:

- **Left sidebar.** Simulation controls (play, step, new seed, replay,
  save), view toggles, the **map editor** (width, height, growth,
  maxArmy, players, wrap), the current **season** standings, the live
  **rankings** table refit from logged matches, and a **saved-matches**
  picker that loads any flagged match as a deterministic replay.
- **Center stage.** The battle canvas. Drag to pan, scroll to zoom,
  press `0` to reset the view.
- **Right sidebar.** Per-player HUD with a strategy dropdown (swap a
  bot live, mid-match), strength-over-time and territory-over-time
  charts, and an event log whose entries double as one-click replay
  shortcuts.

Header buttons: **⚙ Try a bot** opens a paste-a-module modal — drop in
a self-contained ES module that default-exports a strategy and it gets
seated in the next match (browser-only, session-scoped). The seed pill
shows the active match seed and copies on click.

## Keyboard

| Key | Action |
|-----|--------|
| `Space` | play / pause |
| `.` | single-step |
| `R` | new seed (same lineup & map) |
| `L` | replay same seed |
| `S` | save current match to your local saved list |
| `0` | reset pan/zoom |

Speed slider runs 0.1× to 5×.

## Strategies

Every bot is one file in [src/strategies/](src/strategies/), registered
in [src/strategies/index.js](src/strategies/index.js). The active pool
is `STRATEGY_LIST` (everything minus the archive); replay/lookup uses
`ALL_STRATEGY_LIST`. See [docs/strategies.md](docs/strategies.md) for
the bot-author guide and [docs/engine-api.md](docs/engine-api.md) for
the API cheat sheet.

```bash
node tournament/run.js --list        # active strategies
node tournament/run.js --list-all    # active + archived
```

The strategy directory also contains bots produced by the genetic-spawn
system (descendants like `Conqueror_g4_868391.js`, registered in
`descendants.js`) and the lab loadouts in [src/strategies/parametric/](src/strategies/parametric/).

## Tech loadouts

Each tournament entry pairs a strategy with a 5-knob tech allocation
(`move`, `stack`, `prod`, `atk`, `def`) summing to 100. The same
strategy under different techs plays meaningfully differently —
`Berserker-Blitz` vs `Berserker-Fortress` is a real distinction.
Default tech is the neutral `{20,20,20,20,20}` split. Per-bot
character techs live in [src/strategies/characterTechs.js](src/strategies/characterTechs.js).
Full description: [docs/techs.md](docs/techs.md).

## Tournaments

Headless bot tournaments run on Node (>= 19). All modes share a single
CLI entrypoint:

```bash
node tournament/run.js --help
```

### Pool play (default)

Each match draws K random strategies from the pool, repeat M times,
rank by points-per-game. Designed for ranking large strategy populations.

```bash
node tournament/run.js                                       # all bots, lab1, K=6, 200 matches
node tournament/run.js --pool 8 --matches 500
node tournament/run.js --bots Aggressive,Trinity,Vampire     # restricted pool
node tournament/run.js --rating                              # emit Plackett-Luce ratings
```

Matches are reproducible: same `--seed`, same standings. The default
map is `lab1`, picked by the cross-map discrimination sweep — see
[docs/map-search.md](docs/map-search.md).

### League play

Bots are sorted into fixed-size tiers, each tier plays a pool-play
mini-tournament against itself, top promotes / bottom relegates each
season. After a few seasons the rankings sort themselves.

```bash
node tournament/run.js --league
node tournament/run.js --league --seasons 5 --tier-size 8
```

Defaults: tier-size 10, 3 seasons, 20 matches/tier/season, K=6 per
match. Tiers re-seed from refit ratings between seasons.

### Season mode

A season runs a rating tournament and then a top-N round robin among
the leaders, emitting two champions (rating leader + round-robin
winner). Persisted to `tournament/seasons.json`; the browser sidebar
viewer renders the latest one.

```bash
node tournament/run.js --season
node tournament/run.js --season --season-top 8 --season-rr-rounds 30
```

### Lineage / descendant spawning

Bots have a family tree. `--prepare-spawn NAME` prints an LLM prompt
for authoring a descendant of an existing bot; once the descendant
file is written, `--register-descendant` validates it, copies it into
[src/strategies/](src/strategies/), and registers it in the lineage
store. The system also archives the globally weakest active bot when
a new descendant joins (with a family-suicide guard).

```bash
node tournament/run.js --list-lineages
node tournament/run.js --prepare-spawn Conqueror | <your LLM>
node tournament/run.js --register-descendant --name NEW --parent Conqueror --file path/to/NEW.js
```

### Archive

Active pool size is bounded by archiving weak bots. They keep working
in saved replays (resolved through `ALL_STRATEGY_LIST`) but stop
appearing in default tournament pools and the HUD dropdown.

```bash
node tournament/run.js --archive-list
node tournament/run.js --trim-to 60          # archive globally weakest until 60 active
node tournament/run.js --archive-bottom 2    # archive bottom 2 tiers across all leagues
```

### Flag and replay interesting matches

The runner auto-detects interesting matches (close finishes, crowded
endgames, runaways, mutual destruction) and saves them to
[tournament/interesting.json](tournament/interesting.json). Each entry
is self-contained — map config, lineup, seed, tech loadouts, starting
positions — so it survives changes elsewhere.

```bash
node tournament/run.js --list-interesting
node tournament/run.js --replay 12
node tournament/run.js --replay last
node tournament/run.js --list-interesting --flags close-finish,runaway
node tournament/run.js --lineup A,B,C --seed 42        # one specific matchup
node tournament/run.js --lineup-config tournament/loadouts/sanity-mirror.json
```

The sidebar **Saved Matches** panel lists every entry from
`interesting.json`. Click one to load it as a deterministic replay —
same seed, same lineup, same starting positions. Pick another entry
or change the map to leave replay mode.

### Rankings refit

`tournament/matches.jsonl` is the append-only match log. `npm run rank`
refits Plackett-Luce ratings over every logged match (current engine
version only) and writes [tournament/rankings.json](tournament/rankings.json).
The sidebar **Rankings** table reads this file directly.

```bash
npm run rank
```

## Architecture

```
src/
  core/        Game, GameMap, Tile, Army, Player, GamePos, rng, Tech
  strategies/  Bot files + registry; descendants/, parametric/, archive
  client/      EngineClient + GameView (browser side of worker boundary)
  engine/      Worker host/protocol/runner — simulation runs off-thread
  render/      HiDPI canvas renderer + strength/territory charts
  ui/          HUD, controls, map editor, season/league viewers,
               saved-match picker, paste-a-bot modal
  main.js      Browser app entry
tournament/
  arena.js              Headless single-match runner
  scheduler.js          Pool-play / FFA / rating schedulers
  league.js             Tier promote/relegate league mode
  season.js             Rating tournament + top-N round robin
  rank.js               Plackett-Luce rating refit over matches.jsonl
  spawn.js              Lineage/descendant spawn helpers
  lineageStore.js       Family-tree persistence
  archiveFile.js        Active/archived bot partitioning
  flags.js              Interesting-match detection
  maps.js               Map presets (lab1)
  loadouts/             JSON tech-loadout configs for --lineup-config
  map-search/           LOO-consensus map-quality search (see docs/map-search.md)
  run.js                CLI entrypoint
docs/
  strategies.md         Bot-author guide (file format + paste-and-run)
  engine-api.md         Bot-author API cheat sheet
  techs.md              Tech loadout system
  map-search.md         How map presets are chosen
  bot-uploads-roadmap.md Visitor-bot upload plan and threat model
  bitterverse.md        Charter / role in the Bitter ecosystem
```

Plain ES modules. No bundler. No framework. No `npm install`. The
simulation runs in a Web Worker so the renderer never blocks the
engine.
