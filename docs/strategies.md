# Writing a PixelWars bot

A strategy is a tiny ES module that decides what one army does on each tick.

## Two ways to run a bot

- **Try a bot in the browser** — fastest path. Click "⚙ Try a bot" in the
  header, paste a module, name it, hit *Use in match*. The bot is seated
  in slot 0 of the next match and runs in your browser only. Lives for
  this session, gone on refresh. See
  [Pasting a bot in the browser](#pasting-a-bot-in-the-browser) below
  for the constraints (self-contained module, no `import` statements,
  same `act(army, game)` contract).
- **Commit a bot to the repo** — for bots that should live in
  rankings, replays, and the tournament runner. Drop a file in
  `src/strategies/`, register it in `index.js`. See
  [File layout](#file-layout) below.

Both paths use the same `act(army, game)` contract; the only differences
are persistence, the import surface, and how the engine resolves the
module.

## File layout

Drop a new file in `src/strategies/` named after your bot, e.g.
`src/strategies/Stormtrooper.js`. Default-export a strategy object:

```js
// src/strategies/Stormtrooper.js
import { totalStrength } from "../core/Army.js";

export default {
  name: "Stormtrooper",   // unique, matches the filename
  author: "shady",        // freeform
  version: 1,
  description: "Always misses, but with great enthusiasm.",
  summary: `Optional. Free-text thesis / design notes for human readers.
Explain *why* the bot plays the way it does, what matchups you expect
it to win or lose, and any tunables a future reader might want to
revisit. Multi-line template literals are fine.`,
  act(army, game) {
    // your logic here
  },
};
```

`description` is the one-line tooltip shown in the HUD and tournament
listing; `summary` is the long form you'd write in a commit message — a
thesis, rationale, known weaknesses, anything that helps the next reader
understand the design. Nothing in the engine reads `summary`; it is
documentation that lives next to the code that implements it. See the
core bots in `src/strategies/` for examples.

Then add it to the registry list in `src/strategies/index.js`:

```js
import Stormtrooper from "./Stormtrooper.js";
// ...
export const ALL_STRATEGY_LIST = [..., Stormtrooper];
```

`STRATEGY_LIST` (the active pool seen by tournaments and the HUD
dropdown) is derived from `ALL_STRATEGY_LIST` minus anything in the
archive — so register here, not there.

That's it. The bot now appears in the browser HUD dropdown, in the Node
tournament runner, and in `--list`.

### Optional: tech loadout

A strategy can carry a default tech in its `tech` field — a 5-knob
allocation (`move`, `stack`, `prod`, `atk`, `def`) summing to 100.
Tournaments without an explicit `--lineup-config` will use this default;
otherwise the neutral `{20,20,20,20,20}` split applies. See
[docs/techs.md](./techs.md) for what each knob does and how to tune.

## The `act(army, game)` contract

`act` is called once per accumulated *move credit*, not once per tick.
Each army gains credit at the production rate (`growth × prodMult ×
interval`) and `act` only runs when at least 1 credit has banked, then
1 credit is deducted. This keeps movement frequency proportional to
growth — doubling growth doubles both production and move rate, so the
production:logistics ratio is invariant across game speeds. Credit is
capped at 8 and any banked credit is burned in the same tick once it
crosses 1, so an army that idled in its backfield can unleash a burst
of moves when an opening finally appears.

You decide what *this* army does; you don't see or control your other
armies directly. State you store on `army` persists for the army's
lifetime; state on `game` persists for the match.

### What you read from `army`

| Field            | Meaning |
|------------------|---------|
| `army.pos`       | `{ x, y }` of the tile this army occupies |
| `army.strength`  | Current strength (a float, capped by `maxStrength`) |
| `army.maxStrength` | Cap from `Game.maxArmy` |
| `army.player`    | Owning player; compare with `army.player.equals(other)` |

### What you read from `game`

| Call                         | Returns |
|------------------------------|---------|
| `game.map.getTile(x, y)`     | Tile or `null` (handles wrap) |
| `game.map.adjacent(pos, d)`  | Tile in direction `d` (0=W, 1=E, 2=N, 3=S) |
| `game.map.neighbors(pos)`    | 4-tile array, omitting nulls |
| `tile.armies`                | Armies on a tile (read-only — don't mutate) |
| `game.rng()`                 | Seeded float in `[0, 1)`. Use this, NOT `Math.random()` |
| `game.tick`, `game.elapsed`  | Match clock |
| `game.players.list`          | All players |

### Helpers on `army`

- `army.weakestAdjacent(gradient?)` — returns the neighboring tile with the
  least net enemy strength. Optional gradient is `[w, e, n, s]` and biases
  the score per direction.

### What you do (the only "actions")

```js
army.attack(tile, power)
```

Sends `power` strength toward `tile`. The remaining strength stays put.
Returns `false` and is a no-op when the move is invalid:

- tile must be adjacent (not your own tile)
- `power > 0.5`
- you must keep at least 1 strength behind (`army.strength - power >= 1`)

That's it. No teleport, no merging, no surrender. Conflict resolution
(combine with friendlies, fight enemies) happens automatically at the end
of the tick.

## Determinism

Tournaments are reproducible. The seed lives on `game.rng`. If your bot
needs randomness, route it through `game.rng()` so two runs with the same
seed produce the same outcome. Bots that call `Math.random()` will still
work, but they cannot be replayed.

## Helpers shared by core bots

`src/strategies/helpers.js` exports `balanceAttack(army, tile)` —
sends just enough force to either reinforce a friendly tile to parity or
overpower an enemy with margin 1. Reuse it or roll your own.

## Pasting a bot in the browser

The "⚙ Try a bot" modal accepts an ES module that default-exports the
same `{ name, act, ... }` shape described above. The module is loaded
via `URL.createObjectURL` + dynamic `import()`, validated on the main
thread, then re-imported inside the engine Web Worker so the actual
simulation runs your code.

### Constraints

- **Self-contained.** No `import` statements: a Blob URL has no
  resolution context, so `import "../core/Army.js"` (or anything
  relative) will throw on load. Inline any helpers you need.
- **`export default` is required.** A bare object literal won't work;
  the loader reads `module.default`.
- **Same `act(army, game)` contract** as committed bots. `army.tile`,
  `army.tile.neighbors[0..3]` (W, E, N, S), `army.attack(tile, power)`,
  `army.attackPower`, `army.player.id`, `game.rng()`, `game.tick`,
  `tile.armies` — all available exactly the same way.
- **Session-only.** The bot lives in memory for this tab. Refresh and
  it's gone; there is no `localStorage` step. Reset and seed
  controls preserve the seated bot inside the session.
- **The bot's `name` field is overridden** by what you type into the
  modal's name input, so you can paste any module without renaming it.

### Minimum viable bot

```js
export default {
  name: "Drift",
  description: "Pushes east when it can.",
  act(army, game) {
    const east = army.tile?.neighbors[1]; // W=0 E=1 N=2 S=3
    if (east) army.attack(east, army.attackPower * 0.6);
  },
};
```

### Things you can read

| Field                              | Meaning |
|------------------------------------|---------|
| `army.tile`                        | The tile this army is on (or `null` mid-move). |
| `army.tile.neighbors[0..3]`        | Adjacent tile or `null` (W, E, N, S). |
| `army.tile.armies`                 | Armies on this tile, including yours. |
| `army.strength` / `army.maxStrength` | Current and capped strength. |
| `army.attackPower`                 | Max strength you can commit this tick. |
| `army.player.id`                   | Compare with `other.player.id` to identify enemies. |
| `tile.armies[k].player.id`         | Same idea, for armies you can see. |
| `game.rng()`                       | Deterministic float in `[0, 1)`. Use this, not `Math.random()`. |
| `game.tick`                        | Current tick. |

### The only action

```js
army.attack(tile, power);
```

`tile` must be adjacent. `power > 0.5`. The army keeps `strength - power`
behind. Conflict resolution happens automatically at end-of-tick.

### Want to share it?

Right now there's no in-browser submission flow — the persistence path
is "drop the file in `src/strategies/` and open a PR." See
`docs/bot-uploads-roadmap.md` for the planned hardened upload pipeline
(iframe sandbox + CI gates) before any cross-visitor sharing turns on.

## Style guide

- One bot per file. The filename and `name` field should match.
- No globals, no module-level mutable state. State per army goes on
  `army`; state per match goes on `game`.
- Don't mutate other players' armies, tiles, or scores.
- Don't import the renderer / DOM — bots must run headless.
- Cheap is good. `act` runs O(armies × ticks) times per match.

## Running a tournament

```bash
# All registered bots, lab1 map, 10 rounds
npm run tournament

# A specific lineup
node tournament/run.js --bots Stormtrooper,Aggressive,Trinity --rounds 20

# Different map and tick budget
node tournament/run.js --map royale --rounds 30 --ticks 6000

# JSON for plotting
node tournament/run.js --json > results.json

# See what's available
node tournament/run.js --list
```

Scoring is Borda: in an `N`-bot match, 1st gets `N-1` points, last gets
`0`. Ties broken by average rank. Survivors always outrank the dead;
among the dead, dying later beats dying earlier; among survivors, more
territory wins.

Starting positions are rotated each round so every bot visits every
slot — no positional bias.
