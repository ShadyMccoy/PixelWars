# Techs: Asymmetric Bot Loadouts

## Concept

Each tournament entry pairs a **strategy** (the existing behavior code in `src/strategies/`) with a **tech loadout**: a fixed allocation of 100 points across a small set of qualitative knobs. Techs are the asymmetry layer — they make the same strategy play meaningfully differently, and they make different strategies viable in different ways.

The same strategy can appear in a tournament multiple times under different loadouts (`Berserker-Blitz`, `Berserker-Fortress`), and tournaments can include same-strategy mirror matches with different techs to isolate tech effects from strategy noise.

## Knobs

Five knobs, integer-valued, summing to exactly 100:

| knob   | mechanism                                              | archetype |
|--------|--------------------------------------------------------|-----------|
| `move` | minimum garrison an attacking army must leave behind   | Blitz     |
| `stack`| max strength an army can hold                          | Hoarder   |
| `prod` | rate at which armies regrow strength per tick          | Engine    |
| `atk`  | multiplier on effective strength when attacking        | Berserker |
| `def`  | divisor on incoming effective strength when defending  | Fortress  |

`move` is implemented as a per-player garrison floor on `Army.attack`: the engine refuses to let an army drop below its garrison, so high-move bots can throw more strength forward in a single attack while low-move bots are forced to keep larger reserves at home. Concretely (post-v3 rebalance, after a 50-variant sweep showed move dominating the simplex), tech 0 leaves `1.5` strength behind, tech 50 leaves `1.25`, tech 100 leaves `1.0`. The formula is linear with no clamp: `garrison = 1.5 - 0.005 × tech`. Neutral allocation of move=20 leaves `1.4` — a mild penalty for skipping move investment, comparable in spirit to def's 0.84× baseline at tech 0. All strategies reach for `army.attackPower` (= `strength - garrison`) instead of hardcoding `strength - 1`, so the floor scales automatically.

`atk` and `def` extend the existing global `attackerBonus` (`src/core/Game.js:14`) as per-army modifiers; the other three modify per-tick game logic that already exists.

## Trade-off, not pure buff

Tech 0 in a knob means **worse than baseline**, tech 100 means **better**. The baseline anchor for non-move knobs is **tech 20** — the natural average of a 100-point split across 5 knobs — so a peanut-butter loadout `{20,20,20,20,20}` keeps `stack/prod/atk/def` at exactly 1.0×; only `move` differs (1.7 garrison at neutral). Any deviation trades a knob below 20 for another above 20.

Each knob has a single tunable slope constant. For `stack/prod/atk/def` the multiplier is `1.0 + (tech - 20) * slope`. For `move` the formula is `garrison = 1.5 - 0.005 × tech` (linear, no clamp), spanning a 1.5× swing across the tech range — below atk/stack/prod's ~1.3× and well below def's ~2×. Slopes get retuned each balance pass; they're the only thing touched during balance passes.

## Configuration

A `Tech` is a plain object: `{ move, stack, prod, atk, def }` with non-negative integers summing to 100. A tournament entry becomes:

```
{ strategy: 'Berserker', tech: { atk: 60, move: 40 }, name: 'Berserker-Blitz' }
```

Missing keys default to 0. Validation rejects non-integers, negatives, or sums ≠ 100. A neutral default `{ 20, 20, 20, 20, 20 }` is applied to legacy entries that don't specify a tech, so existing tournaments keep working.

## Balance analysis

The point of the system is to be tunable, which means we need feedback from tournament results. Two analyses, both run against tournament output:

1. **Mirror-match regression.** Same strategy on both sides, different techs. Fit `winrate ~ Δtech` (linear, then quadratic + interactions). Positive coefficient with a positive gradient across the simplex ⇒ that knob is OP. Cleanest possible signal, since strategy is held constant.
2. **Marginal-substitution sweep.** For each pair of knobs, sweep mirror matches that shift 10 points at a time from one to the other. Plot winrate vs allocation. Monotonic curves identify dominant knobs operationally.

Cross-strategy aggregation (with strategy fixed-effects) comes later if needed; mirror analysis answers the immediate "is anything OP" question with far less noise.

A neural net is explicitly **not** the tool here — 5 dimensions and bounded sample sizes are well within regression's range, and regression coefficients are directly interpretable as "how much each knob is worth."

## Out of scope (for now)

- Per-game tech changes (techs are fixed for the duration of a match).
- Knobs that overlap existing ones (e.g. "capture-keep ratio" is just `def`; "spawn cost" is just `prod`). New knobs must change *play feel*, not be another lever on the same dial.
- UI for human players to pick a tech. This is bot-only initially.
