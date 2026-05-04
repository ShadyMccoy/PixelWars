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
- **Battle Royale** — eight contenders, no wrap, last AI standing

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

Headless bot tournaments run on Node (>= 19):

```bash
node tournament/run.js                              # all bots, arena, 10 rounds
node tournament/run.js --bots Aggressive,Trinity    # specific lineup
node tournament/run.js --map royale --rounds 30     # different map / longer
node tournament/run.js --list                       # what's available
node tournament/run.js --help
```

Matches are reproducible: `node tournament/run.js --seed 42` always produces
the same standings.

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
docs/
  strategies.md  Bot-author guide
```

Plain ES modules. No bundler. No framework. No `npm install`.
