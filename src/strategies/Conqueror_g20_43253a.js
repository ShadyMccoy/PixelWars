import parent from "./Conqueror_g19_9533e3.js";

// Hypothesis (one knob): shift one tech point def -> atk, taking
// {move:76, stack:0, prod:16, atk:4, def:4}
// to
// {move:76, stack:0, prod:16, atk:5, def:3}.
//
// Why:
//   - In season #137 the parent's worst placement (#6 of 6, seed=249)
//     was directly to Conqueror_g6_53407c, whose entire generative
//     thesis is precisely this same one-point shift: g6_53407c is
//     g5_f15d3e with code byte-identical and a single tech edit
//     def 4 -> atk 5. That bot's own hypothesis was that on an
//     offense-first kernel (which this lineage is - Pass 1 picks
//     kills before any other action), atk amplifies the dominant
//     decision branch while def only matters on turns when an
//     enemy reached us without us killing first - turns Pass 1
//     actively avoids. Direct head-to-head: it crushed the parent
//     #1 vs #6.
//   - The same season also has g9_fd075f (atk:4/def:4, beat parent
//     #1 vs #3) and g11_cb02bc (def:16, beat parent #1 vs #2). The
//     parent's CLOSEST finish was #2 against the def-heavy bot, and
//     its WORST against the asymmetric-atk bot - the placement
//     gradient lines up with exposure to attack output, not defense.
//     That is consistent with: in the lineage's offense-first
//     kernel, marginal atk converts to ranking faster than
//     marginal def.
//   - Mechanism on top of parent's chassis: with MARGIN=0.45 and
//     BONUS=1.4, a kill commit needs `enemy/1.4 + 0.45 <= sLimit`.
//     atk:5 vs the cousin Conquerors at atk:4/def:4 nudges
//     marginal kill margins above the BONUS-amplified commit
//     threshold roughly one tick earlier in close matchups, the
//     same g6_53407c effect that already showed up vs us.
//   - prod stays at 16 because the parent's experiment was the
//     prod 12 -> 16 step itself; pulling that back without a
//     season's worth of evidence would discard the lineage's main
//     trajectory before measuring it. The atk shift is a separate,
//     additive knob.
//   - move:76 stays. The parent comment chain has been documenting
//     since g16 that this saturates lab1's garrison floor (30x22
//     wrap, maxArmy 12), and the placements vs def-heavy g11 (#2)
//     and asymmetric g6 (#6) don't segregate by garrison contention
//     - they segregate by attacker output asymmetry.
//   - Why NOT atk:6/def:2? Two-point swings haven't been validated
//     in this lineage and the parent's commentary establishes that
//     prior asymmetric splits (g15's 5/3, g17's 4/6) underperformed
//     this chassis. The exact 5/3 point that won head-to-head this
//     season is g6_53407c's, so use that exact loadout, not a
//     bolder one.
//   - Why NOT roll prod 16 -> 14 (back to g16's tech)? That's a
//     re-test of g16, generates no new information, and the parent
//     spawn note explicitly cautioned against it. The atk knob is
//     orthogonal to the prod question.
//
// Failure mode: if the lineage's recent atk:4/def:4 winners
// (g13_b41df9, g16_e79590) had it right and 5/3 is genuinely
// brittle on this chassis, mirror matches against atk:4 cousins
// expose def:3 to faster kills than the atk:5 bonus recovers,
// dropping a seed or two. Bounded downside: 1 point moved, half
// the magnitude of g17/g18/g19's bets, and the destination is
// the exact tech of a head-to-head winner against the parent.
//
// Strategy code is byte-identical to parent g19 (which inherits
// through g18 -> g17 -> g16 -> g15 -> g14 via spread). Only the
// tech field is overridden.
export default {
  ...parent,
  name: "Conqueror_g20_43253a",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g19_9533e3 with one tech point shifted def->atk: {move:76, stack:0, prod:16, atk:5, def:3}. Mirrors g6_53407c's winning asymmetry on top of parent's prod-heavy chassis.",
  summary: `Parent Conqueror_g19_9533e3 (move:76, prod:16, atk:4,
def:4) finished season #137 with placements #6, #3, #2, #3, #5
across five tracked seeds. The placements segregate by winner
type: the worst (#6, seed=249) was direct head-to-head loss to
Conqueror_g6_53407c, whose only edit from its own parent was the
exact one-point shift def->atk this descendant adopts. That bot's
generative thesis - on an offense-first kernel, atk amplifies the
dominant decision branch while def only matters on turns Pass 1
actively avoids - applies verbatim to this lineage's chassis,
which is also offense-first (Pass 1 kill picker, Pass 2
Conqueror.act fallback, Pass 3 stencil). The CLOSEST parent
finish (#2, seed=240) was against def-heavy g11_cb02bc; the WORST
was against asymmetric-atk g6_53407c. The placement gradient
tracks attacker output asymmetry, not defensive durability.

This descendant tests g6_53407c's exact one-knob trick on top of
the parent's prod-heavy chassis: tech goes
{move:76, stack:0, prod:16, atk:4, def:4}
to
{move:76, stack:0, prod:16, atk:5, def:3}.

prod stays at 16 because the parent IS the prod 12->16 experiment
and pulling it back before a season measures the gradient would
discard the lineage's main trajectory. move stays at 76 because
the placements don't segregate by garrison contention - they
segregate by attack-output asymmetry. The atk shift is orthogonal
to both knobs and has direct head-to-head evidence in season
#137.

Specifically NOT testing atk:6/def:2 because two-point swings are
unvalidated in this lineage and the parent commentary documents
that prior asymmetric splits (g15 5/3, g17 4/6) underperformed.
The exact 5/3 point that won head-to-head against the parent is
g6_53407c's, so use that exact loadout. Specifically NOT rolling
prod 16->14 because that's a re-test of g16 with no new
information; the atk knob is orthogonal.

Failure mode: if atk:4/def:4 was correct on this chassis and 5/3
is genuinely brittle, mirror matches against atk:4 cousins expose
def:3 to faster kills than the atk:5 bonus recovers. Bounded
downside: 1 point moved, half the magnitude of g17/g18/g19's
bets, destination is a head-to-head winner against the parent.

Strategy code is byte-identical to parent (inherited via spread).
Only the tech field changes.`,
  tech: { move: 76, stack: 0, prod: 16, atk: 5, def: 3 },
};
