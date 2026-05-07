# Map search

How the official ranking map is chosen — treat each candidate config as
an IRT-style test item, run a fresh per-bot ranking on it, then score
the map by how well that ranking predicts the consensus ranking
across all other candidates.

## Why

Map design used to be vibes-based: pick a width/height, pick a growth
rate, see if matches "look interesting." That gives no answer to the
question "is config A actually a better measuring stick than config B?"
The map-search reframes the question as a calibration problem: which
single map best predicts how bots would rank averaged over many maps?

## The metric

Each candidate config gets a fresh Borda-points-per-game ranking on a
balanced 24-bot pool, then is scored on:

- **Discrimination (LOO)** — Spearman correlation between this map's
  per-bot ranking and the *leave-one-out consensus* (mean rank across
  all OTHER configs in the grid). High = this map sorts bots the same
  way most other maps do.
- **Reliability** — split-half Spearman: rank bots on two disjoint
  halves of the seeds, correlate. Low = the result depends on which
  seed you happened to draw. K spreads more comparisons per match,
  so larger k generally has higher reliability at the same match budget.
- **t_stable** — earliest match tick where the in-progress ranking
  matches the final ranking with Spearman ≥ 0.9. A map that resolves
  in 200 ticks instead of 800 produces 4× the data per CPU-second.
- **Composite** — `disc × reliability × 200/t_stable`, clamped to zero
  if discrimination is negative (anti-correlated maps are worse than
  useless), with a smooth timeout penalty.

Bot pool is sliced from `tournament/rankings.json` (the live skill
ranking refreshed by `npm run rank` over every logged match) — fresher
and broader than any single saved league snapshot.

## Running the search

```bash
# Full sweep across size × growth × maxArmy × k (line + wrap=true held
# fixed; ~192 configs at default settings; ~45 min).
node tournament/map-search/discriminate.js \
  --matches 60 --no-reliability \
  --out tournament/map-search/discriminate.json

# Reliability spot-check on the top survivors (much smaller grid, with
# split-half pass enabled; ~5 min).
node tournament/map-search/discriminate.js \
  --sizes 24x18,30x22,38x28 --growths 1.8,2.2 --max-armys 12 --ks 3,5 \
  --matches 80 --reliability \
  --out tournament/map-search/discriminate-top.json

# Smoke test (16 configs, no reliability, ~30s).
node tournament/map-search/discriminate.js --grid small --no-reliability
```

## What the sweep found

Across 192 candidate configs:

- **Discrimination is high (~0.83 LOO Spearman) almost everywhere.**
  Every reasonable map ranks bots roughly the same way. Differentiation
  comes from cost and reliability, not raw signal.
- **k=5 wins once reliability is required.** k=3 looks 6× more efficient
  on raw composite but per-bot ranks are seed-noisy (split-half rel
  0.30–0.41). k=5 spreads 4 comparisons per match instead of 2 and
  stabilizes faster (rel 0.54–0.62) at the same match budget.
- **maxArmy=12 doubles composite vs maxArmy=4** — small army caps cause
  stalemates that time out and destroy efficiency.
- **growth ≥ 1.8** — fast metabolism resolves matches; growth=0.8 maps
  time out at the cap and contribute no signal.
- **Smaller maps win on efficiency**; raw discrimination is largely
  size-independent.
- **Line topology + wrap=true** were held fixed based on prior search
  findings (line beats ring/corners/pairs; wrap=true beats wrap=false).

## Promoted preset

```
| preset | size  | growth | maxArmy | k | composite | discLOO | reliability |
| ------ | ----- | ------ | ------- | - | --------- | ------- | ----------- |
| lab1   | 30×22 | 1.8    | 12      | 5 | 1.01      | 0.84    | 0.56        |
```

Wrap=true, line topology. `lab1` is the bare-`node tournament/run.js`
default and the official ranking map.

## Layout

```
tournament/map-search/
  metrics.js              Spearman, t_stable, pair accuracy
  configs.js              Topology generators (line/ring/corners/pairs/
                          ringTight) used by the sweep
  discriminate.js         Cross-map LOO-consensus sweep CLI
  test-phase{1,3}.js      Unit tests
```

## Re-running after gameplay changes

If something changes the engine in a way that affects match outcomes
(growth, decay, attacker bonus, starting blob, a new tech system…)
the rankings drift. Re-seed:

```bash
# 1. Refresh the bot-pool source by re-ranking from logged matches.
npm run rank

# 2. Re-run the discrimination sweep. Inspect the top configs; if the
#    winner has shifted materially from the current lab1, update
#    tournament/maps.js by hand.
node tournament/map-search/discriminate.js --matches 60 --no-reliability \
  --out tournament/map-search/discriminate.json
```
