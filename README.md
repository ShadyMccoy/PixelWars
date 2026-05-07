# PixelWars

A tile-based strategy sandbox where AI armies fight for territory using pluggable
strategies. Born as a TypeScript/SystemJS prototype, modernized into a zero-build
browser app.

## Run it

No build step. No `npm install`. Just serve the directory and open it.

```bash
python3 -m http.server 8000
# or
npx --yes serve .
```

Then visit <http://localhost:8000>.

## Modes

- **Classic** — three rival civilizations on a wrapping plain
- **Arena** — six AIs in a small ring, fast metabolism
- **Sandbox** — empty world, click to spawn armies, swap strategies live

## Controls

- `Space` — play / pause
- `.` — single-step
- `R` — reset current mode
- Speed slider — 0.1x to 5x simulation rate
- View toggles — grid, territory shading, army glow
- HUD strategy dropdown — change a player's strategy live

## Strategies

`SlowAndSteady`, `Repel`, `Trinity`, `Aggressive`, `Defender`, `Random`,
`Berserker`, `Cautious`, `Swarm`. One file per bot in `src/strategies/`,
registered in `src/strategies/index.js`. See [docs/strategies.md](docs/strategies.md)
for the bot-author guide.

## Tournaments

Headless bot tournaments run on Node (>= 19). Default mode is **pool play**:
each match draws K random strategies from the pool, repeat M times, rank by
points-per-game. Designed for ranking large strategy populations.

```bash
node tournament/run.js                                       # all bots, lab1, K=6, 200 matches
node tournament/run.js --pool 8 --matches 500 --map arena    # different map preset
node tournament/run.js --bots Aggressive,Trinity,Vampire     # restricted pool
node tournament/run.js --list                                # what's available
node tournament/run.js --help
```

Matches are reproducible: same `--seed`, same standings. The default
map is `lab1`, picked by the map-search as the highest-signal preset
for ranking bots — see [docs/map-search.md](docs/map-search.md).

### League play

For sharper rankings, run a **league** — bots are sorted into fixed-size
tiers, each tier plays a pool-play mini-tournament against itself, and at
the end of every season the top of each tier promotes up while the bottom
relegates down. After a few seasons the rankings sort themselves: strong
bots float to the top tier, weak bots sink to the bottom, and every match
pits same-skill opponents against each other.

```bash
node tournament/run.js --league                    # all defaults: tier=10, 3 seasons, 20 matches/tier
node tournament/run.js --league --seasons 5
node tournament/run.js --league --tier-size 8 --promote 1 --relegate 1
node tournament/run.js --league --bootstrap 0      # skip the warm-up; start from listed order
```

Defaults: tier-size 10, 3 seasons, 20 matches/tier/season, K=6 bots per
match, top-2/bottom-2 swap each season, plus a 50-match bootstrap
pool-play to seed initial tiers (otherwise season 1 is just an arbitrary
slicing of the strategy list). On 119 bots that's roughly 770 matches and
~3 minutes on a modern laptop.

### Flag and replay interesting matches

The runner auto-detects interesting matches (close finishes, crowded
endgames, runaways, mutual destruction) and saves them to
`tournament/interesting.json`. Each saved entry is a self-contained replay
record — map config, lineup, seed, and starting positions — so it survives
changes elsewhere in the codebase.

```bash
node tournament/run.js --list-interesting          # browse what was flagged
node tournament/run.js --replay 12                 # rerun saved match #12
node tournament/run.js --replay last               # rerun the most recent
node tournament/run.js --list-interesting --flags close-finish,runaway
node tournament/run.js --lineup A,B,C --seed 42    # run one specific matchup
node tournament/run.js --no-save                   # tournament without persisting
```

### Watch a flagged match in the browser

The sidebar's **Saved Matches** panel lists every entry from
`tournament/interesting.json`. Click one to load it as a deterministic
replay — same seed, same lineup, same starting positions as the headless
match. Reset re-runs that same match. Pick another entry, or change the
mode dropdown, to leave replay mode.

The scheduler, arena, and flag detection are plain ES modules with no Node
dependencies — when a browser-side tournament runner lands, it will share
the same code paths.

## Architecture

```
src/
  core/        Game, GameMap, Tile, Army, Player, GamePos, rng
  strategies/  One file per bot + a registry index
  modes/       Preset configs and starting positions (browser)
  render/      HiDPI canvas renderer + stats chart
  ui/          HUD player cards, control bar
  main.js      Browser app entry
tournament/
  arena.js     Headless single-match runner
  scheduler.js Round-robin / FFA scheduler
  maps.js      Map presets for tournaments
  run.js       CLI entrypoint
  map-search/  Lab framework for picking map presets (see docs/map-search.md)
docs/
  strategies.md   Bot-author guide
  techs.md        Tech loadout reference
  map-search.md   How map presets are chosen
```

Plain ES modules. No bundler. No framework. No `npm install`.
