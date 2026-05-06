# Map search

How map presets are chosen — a psychometric framework that treats each
candidate map config as an IRT test item and ranks bots on it, then scores
the map by how well that ranking discriminates strong from weak bots.

## Why

Map design used to be vibes-based: pick a width/height, pick a growth
rate, see if matches "look interesting." That gives no answer to the
question "is `arena` actually a better measuring stick than `royale`?"
The map-search reframes the question as a calibration problem.

## The metric

Each candidate config is scored on three axes, then composed:

- **Discrimination** — Spearman correlation between the per-bot ranking
  this map produces and a ground-truth ranking (the saved `lab1` league).
  High = strong bots win, weak bots lose.
- **Mid-band discrimination** — within-quartile pair accuracy. Penalizes
  configs where one bot dominates and everyone else is interchangeable.
- **Reliability** — split-half Spearman: rank bots on two disjoint halves
  of the seeds, correlate. Low = the result depends on which seed you
  happened to draw.
- **t_stable** — earliest match tick where the in-progress ranking
  matches the final ranking with Spearman ≥ 0.9. A map that resolves
  in 200 ticks instead of 800 produces 4× the data per CPU-second.
- **Composite** — `(0.5 disc + 0.5 mid) × reliability × 200/t_stable`,
  clamped to zero if the unclipped info is negative (anti-correlated
  maps are worse than useless), then multiplied by a smooth timeout
  penalty. See `tournament/map-search/evaluator.js` for the formula.

## Anchor calibration

`tournament/map-search/anchors.json` lists ~16 hand-curated dominance
pairs of the form `[winner, loser]`, restricted to bots that consistently
land in the top tier vs. the bottom tier across saved leagues. A map
that gets fewer than ~80% of these pairs right is unlikely to be
measuring "good bot" the way we mean it. Anchors are a calibration
sieve, not a primary score.

A second `altPairs` set exists so validation can re-rank under different
anchors and confirm the top configs are stable across the swap.

## Running the search

```bash
# Full search across the default grid (96 wrap=true configs after dropping
# nowrap maps). Two-pass: cull, then deepen on survivors. ~30–45 min.
node tournament/map-search/run.js --grid default --pass1-seeds 20 \
  --pass2-seeds 80 --keep 16 --out search.json

# Smoke test on a 6-config grid (~30s).
node tournament/map-search/run.js --grid small

# Validate planted-degenerate configs land in the bottom + anchor swap
# is stable across runs. ~5 min.
node tournament/map-search/validate.js --seeds 50

# Spot-check by running a real league on a top config and checking that
# known-strong bots cluster in tier 1.
node tournament/map-search/league-spotcheck.js --config 24x18_g1p8_m6_wrap_line_k4

# Promote the top configs from a search run into tournament/maps.js
# (dry-run by default; pass --apply to actually edit the file).
node tournament/map-search/promote.js --input search.json --top 3 --apply
```

## What the search found

Across 192 candidate configs (later narrowed to 96 wrap=true configs
after the first pass):

- **Line topology beats ring/corners/pairs at every map size** — forced
  lateral contact prevents the kingmaker dynamics that emerge from
  rotational spawns.
- **growth=1.8 dominates 0.8 and 1.2** — a metabolism sweet spot:
  fast enough that turtling decays before contact, slow enough that
  strategy decisions still matter.
- **wrap=true beats wrap=false everywhere** — no nowrap config made
  the top 16. Without wrap, corners reward turtling enough to break
  discrimination. Nowrap maps were dropped from the search.
- **k=4 generally outscores k=6** — fewer simultaneous players means
  less FFA noise per match.

## Promoted presets

Three lab-tested presets live in `tournament/maps.js`:

| preset | size  | growth | k | composite | discrimination | reliability |
| ------ | ----- | ------ | - | --------- | -------------- | ----------- |
| `lab1` | 24×18 | 1.8    | 4 | 0.541     | 0.74           | 0.87        |
| `lab2` | 30×22 | 1.8    | 4 | 0.512     | 0.79           | 0.89        |
| `lab3` | 38×28 | 1.8    | 4 | 0.401     | 0.73           | 0.90        |

All wrap=true, line topology. `lab1` is the bare-`node tournament/run.js`
default — league seedings against the current bot pool naturally use the
highest-signal map.

## Layout

```
tournament/map-search/
  metrics.js              Spearman, t_stable, pair accuracy
  configs.js              Config generator + 5 spawn topologies
  anchors.json            Hand-curated dominance pairs (+ alt set)
  evaluator.js            Per-config metrics + composite score
  run.js                  Two-pass search driver CLI
  validate.js             Planted-degenerate + anchor-swap validation
  league-spotcheck.js     Sanity check via a real league run
  promote.js              Write top configs into tournament/maps.js
  test-phase{1,3,4}.js    Unit tests
```

## Re-running after gameplay changes

If something changes the engine in a way that affects match outcomes
(growth, decay, attacker bonus, starting blob, a new tech system…) the
saved league rankings used as ground truth go stale. Re-seed:

```bash
# 1. Run a fresh league on lab1 to produce new ground truth.
node tournament/run.js --league --map lab1 --seasons 5

# 2. Re-run the map-search; it'll pick up the refreshed leagues.json
#    automatically as ground truth.
node tournament/map-search/run.js --grid default --out search.json

# 3. If the top configs shifted materially, promote the new winners.
node tournament/map-search/promote.js --input search.json --top 3 --apply
```
