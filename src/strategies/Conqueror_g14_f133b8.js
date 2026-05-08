import parent from "./Conqueror_g13_b41df9.js";

// Hypothesis (one knob, one reason): extend the validated
// move->prod direction one more step beyond g16_e79590.
// New tech: {move:76, stack:0, prod:16, atk:4, def:4}.
//
// Why:
//   - The parent g13_b41df9's most informative recent loss is
//     season #135 seed=240, where Conqueror_g16_e79590 finished
//     #1 against the parent's #6. g16's only delta from g13 was
//     tech: it pushed g13's own move 90->80 / prod 2->12 shift
//     two more points to {move:78, prod:14}, with strategy code
//     byte-identical to g13's. That is direct head-to-head
//     evidence that the move->prod direction is still paying
//     off at the 78/14 mark on lab1.
//   - The MARGIN=0.45 logic that justified g10's original
//     90->80 / 2->12 shift applies recursively: less strength
//     burned per kill means a larger fraction of produced
//     strength is deployable, so each marginal point of prod
//     amortizes more strongly than at MARGIN=0.6. There's no
//     mechanism that makes that benefit saturate at 14 prod
//     specifically — if 12->14 won, 14->16 should still net
//     positive on per-tick deployable strength.
//   - lab1 is a 30x22 wrap map with maxArmy 12. The garrison
//     floor saturation that move:78 still cleared in g16 is
//     not a sharp cliff: the act() loop's per-tick movement
//     consumption stays well under the floor in normal play,
//     so 78->76 should still saturate. The risk model is mild
//     tempo loss on a heavy-combat tick, not a structural
//     break — the existing Pass 4 / Conqueror.act fallbacks
//     handle low-power ticks cleanly.
//   - Strategy code stays byte-identical to the parent (Pass 1
//     hemisphere/retake-aware, Pass 2 Conqueror.act, Pass 3
//     walk-all-candidates 5x5). atk/def stays symmetric at 4/4
//     because the chassis's needed-strength math is keyed off
//     BONUS=1.4; shifting atk would either waste surplus or
//     under-commit and the symmetric variant has already shown
//     better head-to-head than asymmetric offense (g15->g16).
//
// Failure mode: if move:76 actually undershoots the per-tick
// garrison demand on lab1, the bot pumps its home tile for an
// extra tick instead of attacking. That's a tempo loss, not a
// kill-cadence break — Pass 4's no-margin kill (via the parent
// chassis fallback chain) and the sLimit<=0.5 guard cleanly
// no-op those ticks. If g14_f133b8 regresses, the next step is
// to back off to {move:77, prod:15} or hold at g16's 78/14.
export default {
  ...parent,
  name: "Conqueror_g14_f133b8",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g13_b41df9 with tech extended one more move->prod step beyond g16_e79590: {move:76, stack:0, prod:16, atk:4, def:4}.",
  summary: `Parent Conqueror_g13_b41df9 lost season #135 seed=240
to Conqueror_g16_e79590, which differs from the parent only by
tech: g13's own move 90->80 / prod 2->12 shift, pushed two more
points to {move:78, prod:14}. Strategy code was byte-identical.
That is direct head-to-head evidence that the move->prod
direction is still paying off at the 78/14 mark on lab1.

This descendant continues the same direction by one more step:
move 78->76, prod 14->16. Atk/def stays at symmetric 4/4 because
the chassis's needed-strength math is keyed off BONUS=1.4 and
the symmetric variant has already shown better head-to-head than
asymmetric offense (g15->g16's revert).

The MARGIN=0.45 amortization logic that justified the original
90->80 / 2->12 shift applies recursively: less strength burned
per kill means a larger fraction of produced strength is
deployable, so each marginal point of prod amortizes more
strongly than at MARGIN=0.6. There is no mechanism that makes
the benefit saturate at 14 prod specifically — if 12->14 won
head-to-head, 14->16 should still net positive on per-tick
deployable strength.

lab1's 30x22 wrap / maxArmy 12 garrison floor is not a sharp
cliff. Per-tick act() movement consumption runs well under 80
even in heavy combat, so 78->76 should still saturate. The
failure mode is mild tempo loss on a heavy-combat tick, not a
structural break — the existing Pass 4 / Conqueror.act
fallbacks handle low-power ticks cleanly via the sLimit<=0.5
guard.

Strategy code is byte-identical to the parent (inherited via
spread). Only the tech field changes.`,
  tech: { move: 76, stack: 0, prod: 16, atk: 4, def: 4 },
};
