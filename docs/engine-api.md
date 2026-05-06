# Engine API quick reference

Concise reference for bot authors. Pairs with `docs/strategies.md`,
which covers the file layout and overall contract; this file is the
type / signature cheat sheet.

## Direction indices

`0 = West, 1 = East, 2 = North, 3 = South.` Used wherever a `dir`
parameter or a 4-element neighbor array appears.

## `army` (the thing your `act` is called on)

| Field / method                  | What it is |
|---------------------------------|------------|
| `army.tile`                     | The `Tile` this army occupies. |
| `army.pos`                      | `{ x, y }` shorthand for `army.tile.pos`. |
| `army.strength`                 | Float in `[0, maxStrength]`. |
| `army.maxStrength`              | Per-army cap (engine `maxArmy` × `tech.stack`). |
| `army.attackPower`              | Max strength you can commit while leaving the garrison floor behind. **Always prefer this over `strength - 1`** — it scales with the player's tech. |
| `army.player`                   | `Player`. Compare ids: `army.player.id`. |
| `army.weakestAdjacent(grad?)`   | `Tile` neighbor with the least net enemy strength; optional `[w,e,n,s]` per-direction bias. |
| `army.attack(tile, power)`      | The only mutating call. `tile` must be adjacent, `power > 0.5`, must keep the garrison behind. Returns `false` on invalid; safe to ignore. |
| `army.alive`                    | Read-only; flips to `false` when the army dies. |

## `army.tile` (a `Tile`)

| Field                | What it is |
|----------------------|------------|
| `tile.pos`           | `{ x, y }`. |
| `tile.armies`        | Array of armies on this tile. **Do not mutate.** Mixed-owner during fights; resolved at end of tick. |
| `tile.neighbors`     | 4-element array `[W, E, N, S]`. Entries are `Tile` or `null` at edges of non-wrap maps. |
| `tile.stencil5`      | 25-element flat array, row-major over `[-2..2] × [-2..2]`. Index = `(dy+2)*5 + (dx+2)`, so the center is index 12. Each entry is a `Tile` or `null`. Used for kernel / convolution-style scoring (Trinity, Spearhead, Stencil family). |
| `tile.ownership`     | Float in `[0, 1]` — how strongly the current owner controls the tile. |
| `tile.ownerId`       | Player id of the current owner, or `0` for none. |

## `Player`

| Field             | What it is |
|-------------------|------------|
| `player.id`       | Stable integer id. **Compare by id**, not by reference. |
| `player.minGarrison` | Tech-derived strength floor that must stay on the home tile. |
| `player.techMults` | `{ move, stack, prod, atk, def }` — multipliers from the player's tech loadout. |

## `game`

| Field / method                    | What it is |
|-----------------------------------|------------|
| `game.tick`                       | Integer tick counter. |
| `game.elapsed`                    | Seconds since match start. |
| `game.rng()`                      | Seeded float in `[0, 1)`. **Use this**, never `Math.random()`, or replays diverge. |
| `game.map.getTile(x, y)`          | Returns a `Tile` or `null`. Wraps automatically on wrap-enabled maps. |
| `game.map.adjacent(pos, dir)`     | Tile in that direction (handles wrap). |
| `game.map.neighbors(pos)`         | Up to 4 tiles, nulls omitted. (`tile.neighbors` is 4 with nulls.) |
| `game.map.width`, `.height`       | Map dimensions. |
| `game.maxArmy`                    | Per-army strength cap (before tech multiplier). |

## Helpers (`src/strategies/helpers.js`, `src/core/Army.js`)

```js
import { balanceAttack } from "./helpers.js";
import { sumStrength, totalStrength } from "../core/Army.js";
```

| Helper                          | What it does |
|---------------------------------|--------------|
| `balanceAttack(army, tile)`     | Reinforces a friendly tile to parity, or overpowers an enemy with margin 1. Used by Cautious-style bots. |
| `sumStrength(armies, viewer)`   | **Signed** sum: friendlies of `viewer` add, enemies subtract. Useful for "is this tile net-friendly to me?". |
| `totalStrength(armies)`         | Plain unsigned sum. |

## What you can't do

- Read or mutate other players' armies.
- Spawn, merge, or teleport armies — the only legal action is `army.attack(...)`.
- Touch the renderer / DOM. Bots run headless.
- Use `Math.random()`. Always `game.rng()`.
- Carry module-level state. Per-army state goes on `army`, per-match state goes on `game`.

## Conflict resolution (so you can reason about what happens after `attack`)

1. Each `attack(tile, power)` enqueues a move at end-of-tick.
2. Tiles with multiple owners' armies fight: opposing strengths cancel pairwise.
3. Friendlies on the same tile merge to one army (capped at `maxStrength`).
4. Survivors update `tile.ownership` based on net strength.
5. Each army then `run`s — gains `growth × prod × interval` strength, capped.

This means you commonly see `army.attack` and *then* the engine resolves; your bot does not see post-resolution state until the next tick.
