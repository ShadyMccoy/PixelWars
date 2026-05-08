import parent from "./Conqueror_g19_9533e3.js";

// Hypothesis (one knob): walk back along the move<->prod axis.
// New tech: {move:84, stack:0, prod:8, atk:4, def:4}.
//
// Why:
//   - Parent g19_9533e3 (move:76, prod:16) lost season #136 across
//     all five tracked seeds: #3 (vs g6_27c4e7), #5 (vs g6_53407c),
//     #2 (vs g11_cb02bc), #5 (vs g8_3280dd), #2 (vs g5_f15d3e).
//     Of the five winners that beat it, three run move:90/prod:2
//     (g6_27c4e7, g6_53407c, g8_3280dd), one runs the defensive
//     tech move:80/def:16 (g11_cb02bc), and one is factory
//     (g5_f15d3e). FOUR of five winners run move >= 80, and
//     three run the high-move/low-prod camp the parent's own
//     comment block explicitly discounted.
//   - Compare to season #135 (parent g18, prod:12): placements
//     #6, #2, #2, #5, #4. The g19 step (prod 12 -> 16, move 80 ->
//     76) did NOT improve outcomes against the high-move cluster
//     (#5, #5, #3 in #136 vs #6, #5, #2 in #135). Within the
//     noise band, one season's worth of evidence is that the
//     prod axis stopped paying out.
//   - The lineage chronology now reads:
//       g13 (prod:12) - won season #134.
//       g16 (prod:14) - won season #135 (against g18).
//       g19 (prod:16) - LOST season #136, primarily to move:90.
//     The gradient's monotonic climb (prod 12 -> 14) broke at
//     prod:16. The natural inference is that the optimum sits
//     somewhere below prod:16 and that further climbing is
//     overshoot - the parent's stated failure mode ("if the
//     prod gradient has already saturated at prod:14, the 14->16
//     step is a wash on output... and the 80->76 move trim
//     finally costs garrison floor under heavy contention") is
//     exactly what season #136 looks like.
//   - One-knob walk-back: shift 8 points prod -> move, landing
//     at {move:84, prod:8, atk:4, def:4}. This:
//       (a) keeps the chassis in the moderate-prod camp (prod:8
//           is still well above the high-move cluster's prod:2,
//           so we are NOT abandoning the lineage's thesis - just
//           backing off the overshoot),
//       (b) buys back garrison floor that the high-move winners
//           are actively exploiting (move:84 vs their move:90 is
//           closer than move:76 was; the parent's own comment
//           argued the 76 step "still saturates lab1's garrison
//           floor", but #136's placements against three move:90
//           winners are direct evidence that the saturation
//           argument did not hold up under contention),
//       (c) is a single-axis tradeoff (move<->prod), so the
//           result cleanly tells us whether the gradient
//           reversed or just plateaued.
//   - atk/def stays symmetric 4/4. The lineage's recurring
//     winners at this chassis (g13, g16) and three of #136's
//     winners (g6_27c4e7, g8_3280dd, g11_cb02bc) all run atk:4,
//     so the asymmetric splits remain off-thesis.
//   - Why NOT roll all the way back to {move:90, prod:2}? That
//     is a basin swap, not a one-knob nudge. We have one season
//     of evidence the prod direction is over-extended, not five.
//     The {84, 8} step keeps optionality: if it places better,
//     the gradient really did saturate and the next descendant
//     can probe further along move; if it places worse, the
//     prod axis was load-bearing after all and the answer was
//     somewhere between prod:14 and prod:16, not a basin swap.
//   - Why NOT just go back to {move:80, prod:12} (g18's tech)?
//     That regenerates a known data point with no new
//     information. Stepping past g18 toward the high-move
//     winners is the informative trial.
//
// Failure mode: if the season #136 losses were driven by
// strategy-level mismatches (e.g. the defensive g11_cb02bc
// winner) rather than tech, the move<->prod walk-back is
// orthogonal to the actual problem and the descendant will
// place similarly to g19. Bounded downside: 8 points moved
// along a single axis, still in the lineage's prod-leaning
// camp, and the destination is between two validated winning
// neighborhoods (g16 at prod:14 and the move:90 cluster at
// prod:2).
//
// Strategy code is byte-identical to parent g19 (which inherits
// from g18 -> g17 -> g16 -> g15 -> g14 via spread). Only the
// tech field is overridden.
export default {
  ...parent,
  name: "Conqueror_g20_f5c991",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g19_9533e3 with prod->move walk-back: {move:84, stack:0, prod:8, atk:4, def:4}. Tests whether the move->prod gradient overshot at prod:16.",
  summary: `Parent Conqueror_g19_9533e3 (move:76, prod:16) lost
season #136 across all five tracked seeds (placements: #3, #5, #2,
#5, #2). Four of five winners run move >= 80, and three run the
high-move/low-prod camp (g6_27c4e7, g6_53407c, g8_3280dd at
move:90/prod:2) that the parent's own commentary explicitly bet
against.

The lineage's prod gradient (g13 prod:12 won #134, g16 prod:14 won
#135) broke at prod:16: g19's placements vs the high-move cluster
(#5, #5, #3) are no better than g18's prod:12 placements were in
#135 (#6, #5, #2). One season is not proof of a flipped gradient,
but it is direct evidence that the climb stopped paying out, and
matches the parent's own stated failure mode ("if the prod
gradient has already saturated at prod:14, the 14->16 step is a
wash... and the 80->76 move trim finally costs garrison floor
under heavy contention").

This descendant walks back 8 points along the move<->prod axis:
move 76->84, prod 16->8, atk/def held at symmetric 4/4. The shift
is a single-axis tradeoff so the season tells us cleanly whether
the gradient reversed or merely plateaued. prod:8 is still well
above the high-move cluster's prod:2, so the lineage's
moderate-prod thesis is not abandoned - just backed off the
overshoot. move:84 closes most of the garrison-floor gap to the
move:90 winners that are actively exploiting it.

Specifically NOT going to {move:90, prod:2} because that is a
basin swap rather than a one-knob nudge, and one season of
evidence does not justify discarding the lineage's local
progress. Specifically NOT regenerating {move:80, prod:12}
(g18's tech) because that produces no new information; stepping
past g18 toward the high-move neighborhood is the informative
trial.

Failure mode: if season #136's losses were strategy-level (e.g.
g11_cb02bc's defensive chassis) rather than tech, the move<->prod
walk-back is orthogonal and the descendant places similarly.
Bounded: 8 points moved along a single axis, destination between
two validated winning neighborhoods (g16 at prod:14 and the
move:90 cluster at prod:2).

Strategy code is byte-identical to parent (inherited via spread).
Only the tech field changes.`,
  tech: { move: 84, stack: 0, prod: 8, atk: 4, def: 4 },
};
