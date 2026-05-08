import parent from "./Conqueror_g14_8d5369.js";

// Hypothesis (one thesis, two coupled knobs): roll back the parent's
// prod overshoot, and put the recovered 2 points into def -- the
// axis the parent's own comment flagged as the next pivot.
// New tech: {move:74, stack:0, prod:16, atk:4, def:6}.
//
// Why:
//   - Direct head-to-head evidence the parent overshot. In season
//     #139 seed=245 the parent (74/0/18/4/4) finished #3 to
//     Conqueror_g19_9533e3 (76/0/16/4/4). g19's tech sits exactly
//     one step back from the parent on the same move<->prod axis,
//     and g19's strategy code is byte-identical (inherited via the
//     same g13->g16->g14_f133b8 spread chain). That is a clean
//     A/B: same chassis, two adjacent points on one axis, parent
//     loses. The most natural reading is that the move->prod
//     gradient has finally saturated past prod:16. The parent's
//     own author predicted this exact outcome: "If this regresses,
//     the next iteration should settle at g14_f133b8's 76/16 as
//     the lineage optimum on this chassis, or pivot to a different
//     axis (e.g. test a small def shift since g11_cb02bc's
//     defensive tech also beat the parent...)".
//   - Why NOT just revert to {76, 0, 16, 4, 4} (= g19's exact tech)?
//     That is a byte-identical duplicate of g19. The season would
//     produce no new information beyond what we already have - g19
//     is a tested, registered, ranked bot. The whole point of a
//     descendant is to probe a previously-untested point in the
//     tech space.
//   - Why keep move at 74 (not back up to g19's 76)? The parent
//     comment establishes that lab1's per-tick act() consumption
//     runs well under 76 even in heavy combat, so move:74 is still
//     inside the saturation band. The parent's loss to g19 is
//     better explained by the prod:18 overshoot (where the lineage
//     was actively probing) than by the move:74 trim (where the
//     lineage already saturated). Holding move:74 keeps the
//     comparison clean: this descendant differs from g19 only on
//     def axis, so if it wins/loses we learn about def, not move.
//   - Why def, specifically? Three reasons converge:
//       (a) The parent's own author flagged it: g11_cb02bc's
//           defensive tech beat the parent in an earlier seed,
//           making it the first-listed pivot candidate.
//       (b) The recent loss log shows two losses to the high-move
//           cluster (g6_27c4e7 in seed=250, g9_fd075f in seed=248),
//           both winners running 90/0/2/4/4. Those bots are
//           movement-dense aggressors that pile adjacent enemies
//           into the parent's combat zones. Higher def reduces
//           strength burned defending the home tile and adjacent
//           pushed cells against multi-source attacks, leaving
//           more produced strength deployable - the same
//           amortization logic that justified the original prod
//           push, applied on a different multiplier.
//       (c) The prompt's tech guidance: "Tech is historically
//           under-explored in this lineage." Every recent winner
//           in this lineage runs atk:4 def:4 - that 4/4 box is a
//           local convention, not a tested optimum. def:6 at the
//           cost of 2 prod is well inside the budget.
//   - Why not asymmetric atk shift instead? The parent comment
//     directly reports that asymmetric offense variants (g15's
//     5/3) lost to symmetric on this chassis. Asymmetric DEFENSE
//     is genuinely untested in the recent lineage; the negative
//     evidence is on the atk side, not def.
//
// Failure mode: if the def slope is shallow on lab1 (most kills
// resolve quickly enough that the 4->6 def bump rarely converts
// before the army is reset by combat), the 2 lost prod points
// are a small per-tick output regression with no compensating
// gain. Bounded downside: 2 points moved, same magnitude as
// recent lineage iterations, and we are still on the validated
// 74-move / 16-prod base that g19 already won at.
//
// Strategy code is byte-identical to the parent (which inherits
// from g13_b41df9 -> g14_f133b8/g16_e79590 chain). Only the tech
// field is overridden.
export default {
  ...parent,
  name: "Conqueror_g15_62035e",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g14_8d5369 with prod overshoot rolled back and recovered points sent to def: {move:74, stack:0, prod:16, atk:4, def:6}. Tests the def axis on the g19-validated 74-move base.",
  summary: `Parent Conqueror_g14_8d5369 (74/0/18/4/4) lost season
#139 seed=245 to Conqueror_g19_9533e3 (76/0/16/4/4). g19's strategy
code is byte-identical to the parent's (same g13->g16->g14_f133b8
spread chain), so that head-to-head is a clean A/B on a single
axis: the parent's prod:18 overshot the move<->prod gradient that
g19 caught at prod:16. The parent's own author predicted exactly
this outcome and recommended either (a) settling at the 76/16
lineage optimum, or (b) pivoting to def axis on g11_cb02bc's
precedent. Option (a) would be a byte-identical duplicate of g19,
generating no new information; option (b) probes a genuinely
untested point.

This descendant takes both prod points the parent overshot by
(18->16) and reallocates them to def (4->6), while holding
move:74 to keep the comparison vs g19 single-axis (def-only).
Hypothesis: lab1's heavy-contention seeds, where the lineage's
recent losses to the move:90 aggressor cluster (g6_27c4e7 in
seed=250, g9_fd075f in seed=248) concentrate, reward defense by
the same amortization logic that drove the prod push - less
strength burned defending the home tile and pushed cells leaves
more deployable surplus per tick. atk stays at 4 because the
parent comment establishes asymmetric offense (g15's 5/3) lost
to symmetric on this chassis; the negative evidence is atk-side,
def-side asymmetric is genuinely untested.

Failure mode: if def's slope is shallow on lab1 (kills resolve
fast enough that 4->6 rarely converts before army reset), the 2
prod points are a small per-tick regression with no compensating
gain. Bounded downside: 2 points moved, base is the g19-validated
74-move tech, no strategy code change.

Strategy code is byte-identical to parent (inherited via spread).
Only the tech field changes.`,
  tech: { move: 74, stack: 0, prod: 16, atk: 4, def: 6 },
};
