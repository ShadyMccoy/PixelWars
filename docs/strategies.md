# Writing a PixelWars bot

A strategy is a tiny ES module that decides what one army does on each tick.

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
export const STRATEGY_LIST = [..., Stormtrooper];
```

That's it. The bot now appears in the browser HUD dropdown, in the Node
tournament runner, and in `--list`.

## The `act(army, game)` contract

`act` is called once per army per tick. You decide what *this* army does;
you don't see or control your other armies directly. State you store on
`army` persists for the army's lifetime; state on `game` persists for the
match.

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
