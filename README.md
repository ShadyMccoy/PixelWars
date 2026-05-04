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
`Berserker`, `Cautious`, `Swarm`. Drop new ones into `src/strategies/index.js`
and they appear in the HUD automatically.

## Architecture

```
src/
  core/        Game, GameMap, Tile, Army, Player, GamePos
  strategies/  AI behaviors (army -> game)
  modes/       Preset configs and starting positions
  render/      HiDPI canvas renderer + stats chart
  ui/          HUD player cards, control bar
  main.js      App entry
```

Plain ES modules. No bundler. No framework.
