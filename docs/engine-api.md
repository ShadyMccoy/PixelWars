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
2. Friendlies on the same tile merge to one army (capped at `maxStrength`).
3. **Roles are derived from the tile holder**, not from per-army flags. An army is a *defender* iff `army.player.id === tile.ownerArmy()?.player.id` (the sticky holder); every other army on the tile is an *attacker/invader*. The structural attacker/defender asymmetry comes from the sticky holder mechanic + Lanchester's square law — the legacy global `attackerBonus` defaults to 1.0.
4. **Staged attrition** on tiles with multiple players' armies. Each side's per-tick base loss is `min(myStr, rate × pressure + floor)` raw strength (defaults `rate = 0.06`, `floor = 0.5`; `rate` is the map-level "Attrition" setting). The base loss is then scaled by enemy "causing losses" tech and divided by my "taking losses" tech — `tech.atk` and `tech.def` apply symmetrically regardless of holder role: `tech.atk` multiplies the damage I cause to enemies, `tech.def` divides the damage I take from them. A fair neutral-tech 6v6 takes ~7 ticks; a 1v1 snaps in 1–2 (the floor dominates). `combatModel` controls how pressure is computed: `lanchester` (default) uses sum-of-squared enemy strengths so a 2x ratio compounds (~4x advantage); `linear` uses raw enemy strength.
5. **Sticky holder**: the tile's owner persists across ticks while the prior holder still has any army on the tile. Ownership only transfers when the prior holder loses their last army there. When multiple non-holder armies are left after that (e.g., two attackers contesting after the defender fell), the tile is in flux — `tile.ownerArmy()` returns `null` and the tile reads as neutral for territory totals until one side clears it.
6. Each army then `run`s — gains `growth × prod × interval` strength, capped.

This means contested tiles can persist with multiple players' armies for several ticks, creating "brackish" zones where a campaign has bulged into enemy territory. Your bot does not see post-resolution state until the next tick. **`tile.armies` is sorted by descending raw strength after resolution**, but use `tile.ownerArmy()` (sticky holder) to ask *who controls this tile right now*, not `tile.armies[0]`.
