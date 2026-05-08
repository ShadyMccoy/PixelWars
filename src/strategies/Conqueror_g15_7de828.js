import parent from "./Conqueror_g14_8d5369.js";

// Hypothesis (one knob, one reason): revert the parent's move/prod
// overshoot back to the validated lineage optimum.
// Tech goes
//   {move:74, stack:0, prod:18, atk:4, def:4}
// to
//   {move:76, stack:0, prod:16, atk:4, def:4}.
//
// Why:
//   - The parent's bet was that the move->prod gradient kept paying
//     beyond 76/16 because MARGIN=0.45 amortization is "recursive in
//     prod". Season #142 says it doesn't. Two of the parent's five
//     tracked losses are direct evidence:
//       - seed=240 winner Conqueror_g20_43253a runs
//         {move:76, prod:16, atk:5, def:3}
//       - seed=217 winner Conqueror_g21_e2aa5a runs
//         {move:76, prod:16, atk:4, def:4}
//     Both winners share move:76/prod:16; neither pushed past it.
//     The parent's prod:18 line did push past it and finished #5
//     and #4 in those seeds.
//   - g21_e2aa5a's case is especially clean: it inherits the same
//     byte-identical strategy code as the parent (via the spread
//     chain g21<-g20<-...<-g15<-g14<-g13). Strategy code held
//     constant, the only delta is tech, and 76/16/4/4 beat
//     74/18/4/4 head-to-head. That's a tech-only A/B verdict in
//     favor of the lineage-optimum move/prod allocation.
//   - The parent's own spawn comment documented this exact
//     contingency: "If this regresses, the next iteration should
//     settle at g14_f133b8's 76/16 as the lineage optimum on this
//     chassis." This descendant is that documented response.
//   - Why NOT also tweak atk/def? g20_43253a tried 5/3 and lost a
//     season later to g21_e2aa5a's 4/4 revert (well-documented in
//     g21's comment). The lineage's accumulated evidence on the
//     atk/def axis points back at symmetric 4/4. Touching it here
//     would compound two unsettled bets.
//   - Why NOT step partway (e.g. 75/17)? A half-step doesn't test a
//     hypothesis. The hypothesis under test is "76/16 is the
//     optimum on this chassis"; the clean test is to land on 76/16
//     exactly and read the season placement against the parent and
//     against the asymmetric-atk cousins. If 76/16 outranks the
//     parent, the move->prod axis is settled at 16. If it does not,
//     the prod gradient extends past 18 and the axis needs revisit.
//   - Stack stays at 0. The lineage has never touched stack and
//     this descendant is not the place to add a second knob; the
//     point of this iteration is to read a clean signal on the
//     move/prod revert.
//
// Failure mode: if the season #142 results were sample noise and
// the parent's prod:18 bet was actually directionally correct,
// reverting to 76/16 gives up the marginal deployable-strength
// gain on long matches and drops a placement or two against the
// move/prod-pushed cousins. Bounded downside: destination tech
// is the validated optimum on this chassis (g14_f133b8 win
// against the parent's parent, g21_e2aa5a win against this
// parent), strategy code is byte-identical via spread, and the
// move shift is back UP (toward the chassis's documented
// garrison floor) rather than down into untested territory.
//
// Strategy code stays byte-identical to the parent (inherited
// via spread). Only the tech field is overridden.
export default {
  ...parent,
  name: "Conqueror_g15_7de828",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g14_8d5369 with move/prod reverted from {74,18} to the validated lineage optimum {76,16}. Documented response after season #142 losses to two move:76/prod:16 cousins, including a byte-identical-strategy A/B loss to g21_e2aa5a.",
  summary: `Parent Conqueror_g14_8d5369 took the move->prod axis one
step past the validated 76/16 optimum, going to
{move:74, stack:0, prod:18, atk:4, def:4}. The bet was that the
MARGIN=0.45 amortization argument is "recursive in prod" - each
marginal prod point converts more strength to deployable form -
so 16->18 should net positive on per-tick output the same way
12->14 and 14->16 had.

Season #142 contradicts that. Two of five tracked losses are to
move:76/prod:16 cousins:
  - seed=240: Conqueror_g20_43253a, {move:76, prod:16, atk:5, def:3},
    finished #1 with the parent at #5
  - seed=217: Conqueror_g21_e2aa5a, {move:76, prod:16, atk:4, def:4},
    finished #1 with the parent at #4
Neither winner pushed move/prod past 76/16. The parent's line did
and ranked below them.

g21_e2aa5a's loss is the cleanest A/B: its strategy code is
byte-identical to the parent's (both inherit through the spread
chain ...g15<-g14<-g13). Code held constant, the only delta is
tech, and 76/16/4/4 beat 74/18/4/4 head-to-head.

This descendant reverts ONLY the move/prod axis to 76/16 and
keeps atk/def at the symmetric 4/4 the lineage's accumulated
evidence supports. Stack stays at 0; the point of this iteration
is a clean read on the move/prod revert, not opening a new knob.

The parent's own spawn comment documented this exact contingency:
"If this regresses, the next iteration should settle at
g14_f133b8's 76/16 as the lineage optimum on this chassis." This
is that response.

Failure mode: if season #142 was sample noise and prod:18 was
directionally correct, the revert gives up marginal deployable
strength on long matches. Bounded downside: destination is the
validated optimum (g14_f133b8 won vs the parent's parent,
g21_e2aa5a won vs this parent), strategy code is byte-identical
via spread, and the move shift is upward toward the documented
garrison floor rather than into untested territory.`,
  tech: { move: 76, stack: 0, prod: 16, atk: 4, def: 4 },
};
