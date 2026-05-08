# Round-robin / upset framework

Head-to-head all-pairs analysis for finding bots whose results
disagree with their global rating — the kind of pair that signals a
real style mismatch worth studying.

## Why

Pool play (K=6) gives a reliable global ranking but muddles every
"loss" with the actions of K-2 other bots. If `Vampire` sits 3rd in a
match, did `Trinity` beat it, or did `Trinity` get there by feeding
on `Hunter` while `Vampire` got pinned by `Aggressive`? The K=6 PL
fit averages this out across hundreds of matches, but it can't tell
you "does `Vampire` actually beat `Trinity` head-to-head?"

Round-robin K=2 answers that question directly. Multiple seeds per
pair separate map/seed luck from a stable matchup property. An
"upset" — a pair where observed score is far from rating-predicted —
is a candidate for the thesis-comparison workflow: read both bots'
`summary` fields, hypothesize *why* the matchup goes the way it does,
design experiments to test the hypothesis.

## The pipeline

Three subcommands on `tournament/rr.js` form a pipeline:

1. **`run`** — schedule all-pairs matches and save the pairwise
   matrix to `tournament/round-robin.json`.
2. **`analyze`** — read the matrix and `tournament/rankings.json`,
   flag pairs whose observed head-to-head score is far from
   Elo-expected.
3. **`reroll`** — re-run flagged pairs at a *fresh* seed slice and
   classify each: does the upset hold up, or did we get lucky?

```
npm run rr -- run --bots A,B,C,D --seeds-per-pair 8
npm run rank                                       # refresh ratings
npm run rr -- analyze --delta 0.20 --min-games 5
npm run rr -- reroll --top 20 --extra-seeds 10
```

`run` also appends matches to `matches.jsonl` by default — re-running
`npm run rank` lets the global PL fit absorb the new K=2 evidence.

## What counts as a win

Per-pair scoring is from A's perspective:

- A wins (decisive, A survives, B eliminated, not stalemated) → 1
- B wins → 0
- Draw (stalemate, mutual-destruction, or both survive at maxTicks) → 0.5

Territory-tiebreak K=2 finishes are **not** counted as wins. With
only two players, the territory tiebreak is too noisy to distinguish
from a real win — PL already handles that with stalemate expansion,
and the upset detector wants only decisive evidence.

## What counts as an upset

A pair is flagged when **all three** hold:

- |observed − expected| ≥ `--delta` (default 0.20)
- games per pair ≥ `--min-games` (default 5)
- Wilson 95% CI on observed score does **not** contain expected

Expected score uses the Elo formulation
`1 / (1 + 10^((r_B − r_A) / 400))`, equivalent to the PL skill ratio
under the rating scaling in `tournament/rank.js`. Ratings come from
`tournament/rankings.json` — bots missing from rankings get the
default 1000.

The Wilson-CI gate is what suppresses under-sampled noise. With 3
seeds per pair you essentially can't flag anything, because the CI
on a 3-0 sweep is wide enough to overlap almost any expected value.
This is intended: at low seed counts you don't know enough to call
something an upset. Bump `--seeds-per-pair` if `analyze` keeps
returning empty.

## Re-roll classification

`reroll` runs each flagged pair at `baseSeed + 1_000_003` (or
`--reroll-seed N`) so the new seed slice is disjoint from the
original. Each pair gets one of:

- **`amplified`** — re-roll delta is *further* from expected than the
  original. Strongest signal: the upset is stable and possibly
  bigger than first measured.
- **`confirmed`** — re-roll lands on the same side of expected as the
  original, by ≥ `--delta`. The upset is real.
- **`flipped`** — re-roll lands on the *opposite* side of expected,
  by ≥ `--delta`. Pair is unstable; the original may have been a
  fluke or this matchup is genuinely seed-sensitive.
- **`reverted`** — re-roll comes back inside `--delta` of expected.
  The original was probably a small-sample artifact.

Output is sorted amplified → confirmed → flipped → reverted, biggest
absolute after-delta first.

## Maps

`duel1` (20×14 wrap line, growth 1.8, maxArmy 12) is the default
head-to-head preset. **Untuned** — picked by analogy to `bracket1`
with a smaller footprint to scale with K=2. If RR runs surface
chronic stalemates, sweep it through `tournament/map-search/` at
K=2 to find a more decisive 1v1 map. Pass `--map NAME` to use a
different preset.

## Pair-seat balance

Map positions are not perfectly symmetric — a wrap-line spawn at
slot 0 vs slot 1 can subtly favor one slot. The runner alternates
which strategy occupies slot 0 across seeds, so an even
`--seeds-per-pair` gives perfectly balanced seat assignment. Odd
counts give the canonical (sorted-first) bot one extra seed at slot
0; prefer even counts when comparing close matchups.

## Determinism

Pair seeds derive from `baseSeed + pairIndex * 1009`, and the match
seed is `pairSeed + seedIndex`. Re-running with the same `--seed` and
`--seeds-per-pair` reproduces matches bit-for-bit. The reroll
default seed offset (`baseSeed + 1_000_003`) is large enough that
the original and reroll seed slices never overlap for any
realistically-sized field.

## When to use this vs `--league` or `--season`

- **`--league` / `--season`** — produce *the* global ranking. Use
  these when you want to know who is best.
- **`rr run` + `analyze`** — find specific *pairs* where the global
  ranking and head-to-head reality disagree. Use this after a
  league/season has produced a stable ranking, when you want to
  understand *why* a particular matchup is non-transitive.

The two are complementary: RR matches feed back into `matches.jsonl`,
so the next `npm run rank` absorbs the head-to-head evidence into
the global rating.

## Cost

All-pairs at field size N = `N*(N-1)/2` pairs × `seeds-per-pair`
matches. At 190 active strategies and 5 seeds/pair that's ~90,000
matches — feasible but slow. **Curate the field** before a full RR:

- one champion per lineage family (see `--list-lineages`)
- top-N from the current rankings
- a hand-picked panel of bots whose styles you want to compare

Pass the curated list with `--bots A,B,C,...`.
