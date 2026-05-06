# Techs: Asymmetric Bot Loadouts

## Concept

Each tournament entry pairs a **strategy** (the existing behavior code in `src/strategies/`) with a **tech loadout**: a fixed allocation of 100 points across a small set of qualitative knobs. Techs are the asymmetry layer — they make the same strategy play meaningfully differently, and they make different strategies viable in different ways.

The same strategy can appear in a tournament multiple times under different loadouts (`Berserker-Blitz`, `Berserker-Fortress`), and tournaments can include same-strategy mirror matches with different techs to isolate tech effects from strategy noise.

## Knobs

Five knobs, integer-valued, summing to exactly 100:

| knob   | mechanism                                              | archetype |
|--------|--------------------------------------------------------|-----------|
| `move` | how often the strategy gets to act per tick            | Blitz     |
| `stack`| max strength an army can hold                          | Hoarder   |
| `prod` | rate at which armies regrow strength per tick          | Engine    |
| `atk`  | multiplier on effective strength when attacking        | Berserker |
| `def`  | divisor on incoming effective strength when defending  | Fortress  |

`move` is implemented as a per-army accumulator: each tick the army adds `moveMult` to a counter; while the counter ≥ 1 the strategy fires and the counter decrements. So tech 100 with `moveMult ≈ 1.6` fires roughly 1.6× per tick (sometimes twice), and tech 0 with `moveMult ≈ 0.85` fires ~85% of ticks.

`atk` and `def` extend the existing global `attackerBonus` (`src/core/Game.js:14`) as per-army modifiers; the other three modify per-tick game logic that already exists.

## Trade-off, not pure buff

Tech 0 in a knob means **worse than baseline**, tech 100 means **better**. The baseline anchor is **tech 20** — the natural average of a 100-point split across 5 knobs. So an even peanut-butter loadout `{20,20,20,20,20}` is genuinely neutral (every multiplier = 1.0), and any deviation trades a knob below 20 for another above 20.

Each knob has a single tunable slope constant. The multiplier is `1.0 + (tech - 20) * slope`, with the slope chosen per knob so tech 0 is a meaningful penalty and tech 100 is a meaningful buff. Slopes are placeholders until calibration; they're the only thing touched during balance passes.

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
