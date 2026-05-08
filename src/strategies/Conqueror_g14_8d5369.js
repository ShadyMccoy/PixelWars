import parent from "./Conqueror_g13_b41df9.js";

// Hypothesis (one knob, one reason): extend the validated
// move->prod direction one more step beyond g14_f133b8.
// New tech: {move:74, stack:0, prod:18, atk:4, def:4}.
//
// Why:
//   - The parent g13_b41df9 lost to Conqueror_g14_f133b8 in
//     season #137 seed=224. g14_f133b8 differs from the parent
//     only by tech: it pushed the parent's own 80/12 shift two
//     more points to {move:76, prod:16}, with strategy code
//     byte-identical. That's a direct head-to-head datapoint
//     that the move->prod direction was *still* paying off at
//     the 76/16 mark on lab1, two steps past the parent.
//   - g16_e79590 (78/14) and g14_f133b8 (76/16) form a
//     monotone winning trail on this lineage's tech axis. No
//     mechanism makes that trail saturate at 16 prod
//     specifically: the MARGIN=0.45 amortization argument
//     (less strength burned per kill -> larger deployable
//     fraction of produced strength) is recursive in prod.
//     If 12->14 and 14->16 both won head-to-head, 16->18
//     should still net positive on per-tick deployable
//     strength.
//   - lab1 is 30x22 wrap with maxArmy 12. Per-tick act() loop
//     movement consumption runs well under 80 even in heavy
//     combat, so 76->74 keeps the garrison floor comfortably
//     above what the strategy actually consumes. The risk is
//     tempo loss on a heavy-combat tick, not a structural
//     break - the existing Pass 4 / Conqueror.act fallbacks
//     handle low-power ticks cleanly via the sLimit<=0.5
//     guard.
//   - Strategy code stays byte-identical to the parent (Pass 1
//     hemisphere/retake-aware with RETAKE_VETO=1.5, Pass 2
//     Conqueror.act fallback, Pass 3 walk-all-candidates 5x5
//     stencil). atk/def stays at symmetric 4/4 because the
//     chassis's needed-strength math is keyed off BONUS=1.4;
//     shifting atk would either waste surplus or under-commit,
//     and the asymmetric offense variant lost to symmetric in
//     the g15->g16 revert.
//
// Failure mode: if move:74 finally undershoots the per-tick
// garrison demand on lab1, the bot pumps its home tile an
// extra tick instead of attacking. That's a tempo loss, not a
// kill-cadence break - the sLimit<=0.5 guard cleanly no-ops
// those ticks. If this regresses, the next iteration should
// settle at g14_f133b8's 76/16 as the lineage optimum on this
// chassis, or pivot to a different axis (e.g. test a small
// def shift since g11_cb02bc's defensive tech also beat the
// parent in seed=240).
export default {
  ...parent,
  name: "Conqueror_g14_8d5369",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g13_b41df9 with tech extended one more move->prod step beyond g14_f133b8: {move:74, stack:0, prod:18, atk:4, def:4}.",
  summary: `Parent Conqueror_g13_b41df9 lost season #137 seed=224
to Conqueror_g14_f133b8, which differs from the parent only by
tech: it pushed the parent's own 80/12 shift two more points to
{move:76, prod:16}, with strategy code byte-identical. Combined
with g16_e79590's earlier 78/14 win, this is two consecutive
head-to-head wins along a single monotone tech axis on the
parent's strategy chassis.

This descendant continues the same direction by one more step:
move 76->74, prod 16->18. Atk/def stays at symmetric 4/4 because
the chassis's needed-strength math is keyed off BONUS=1.4 and
the symmetric variant has already shown better head-to-head than
asymmetric offense (g15->g16's revert).

The MARGIN=0.45 amortization logic that justified the original
90->80 / 2->12 shift is recursive in prod: less strength burned
per kill means a larger fraction of produced strength is
deployable, so each marginal prod point amortizes more strongly
than at MARGIN=0.6. There's no mechanism that makes the benefit
saturate at 16 prod specifically - if 12->14 and 14->16 both won
head-to-head, 16->18 should still net positive on per-tick
deployable strength.

lab1's 30x22 wrap / maxArmy 12 garrison floor is not a sharp
cliff. Per-tick act() movement consumption runs well under 76
even in heavy combat, so 76->74 should still saturate. The
failure mode is mild tempo loss on a heavy-combat tick, not a
structural break - the sLimit<=0.5 guard cleanly no-ops
low-power ticks via the existing Conqueror.act fallback chain.

Strategy code is byte-identical to the parent (inherited via
spread). Only the tech field changes. If this regresses, the
lineage optimum on this chassis is most likely g14_f133b8's
76/16, and the next iteration should pivot to a different axis
(e.g. a small def reallocation, since g11_cb02bc's defensive
loadout also beat the parent in seed=240).`,
  tech: { move: 74, stack: 0, prod: 18, atk: 4, def: 4 },
};
