import parent from "./Conqueror_g16_e79590.js";

// Hypothesis (one knob): bisect the move->prod direction between
// g14_7d3830 (move:80, prod:12, validated winner) and g16_e79590
// (move:78, prod:14, the parent that lost head-to-head).
// New tech: {move:79, stack:0, prod:13, atk:4, def:4}.
//
// Why:
//   - Season #132 produced damning head-to-head evidence against
//     g16's tech specifically. Loss #2 (seed=175) was a direct
//     same-chassis loss to g14_7d3830 - the exact ancestor whose
//     code g16 inherits byte-for-byte. The only delta is tech,
//     so the result is a clean A/B test that says move:78 / prod:14
//     under-performs move:80 / prod:12.
//   - Loss #1 (seed=199) compounds the signal: parent finished
//     #3 behind g13_b41df9, another same-chassis cousin running
//     g14's exact tech (80/12). Two of five recent losses are to
//     bots that differ from the parent only in tech, both running
//     80/12. Loss #3 (seed=157) winner g8_9d8b65 also runs move:80.
//     Three of five losses share move:80; only g16 in this batch
//     runs move:78.
//   - The original g13->g14 hypothesis (MARGIN=0.45 makes prod
//     compound more strongly than at MARGIN=0.6, so move 90->80 /
//     prod 2->12 pays off) was correct - the win record proves it.
//     g16's mistake was extrapolating linearly past the validated
//     point. The marginal prod from 12->14 may still help, but
//     evidently not enough to offset whatever move:78 costs in
//     garrison cadence on lab1.
//   - Bisecting at 79/13 keeps g16's directional bet alive while
//     halving the step size. If 79/13 wins against the same field
//     that 78/14 lost to, the lineage has evidence that the
//     move->prod gradient continues past g14 but with diminishing
//     returns - and the next descendant can either re-test 78/14
//     with a strategy improvement, or settle on 79/13 as the new
//     tech baseline.
//
// Failure mode: if the *direction* of the step (not just size)
// is wrong on lab1 - i.e. move:80 is the actual local optimum -
// then 79/13 will also lose, but by less than 78/14 did. That
// still gives the next descendant a clean signal: revert to g14's
// 80/12 and tune strategy instead. Either outcome advances the
// lineage's tech understanding by one bisection step.
//
// Strategy code is byte-identical to parent g16 (which inherits
// from g14 via spread). Only the tech field is overridden.
export default {
  ...parent,
  name: "Conqueror_g17_397562",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g16_e79590 with tech bisected toward g14: {move:79, stack:0, prod:13, atk:4, def:4}.",
  summary: `Parent Conqueror_g16_e79590 lost head-to-head against
its same-chassis cousins running g14's tech (move:80, prod:12). The
most informative datapoint is season #132 seed=175, where parent
finished behind Conqueror_g14_7d3830 itself - g14 and g16 share
byte-identical strategy code and differ only in tech (80/12 vs
78/14), so the loss is a clean A/B verdict that the move:78 /
prod:14 step over-shot. Two more losses in the same season went to
bots running move:80 (g13_b41df9 at seed=199, g8_9d8b65 at
seed=157), corroborating the signal.

The original g13->g14 thesis (MARGIN=0.45 makes prod compound more
strongly than at MARGIN=0.6, justifying move 90->80 / prod 2->12)
was correct on the win record. g16's error was extrapolating
linearly past the validated point. This descendant bisects: instead
of reverting fully to 80/12 or pushing further to 78/14, try 79/13
- one step into the move->prod direction beyond g14, half the size
of g16's failed step.

If 79/13 outperforms the field that beat 78/14, the lineage has
evidence the gradient continues past g14 with diminishing returns
and a new tech baseline. If 79/13 also loses, the next descendant
reverts to g14's 80/12 and tunes strategy instead - either way the
bisection advances tech understanding by one informative step.

Strategy code is byte-identical to parent g16 (which inherits from
g14 via spread). Only the tech field changes. atk/def stay
symmetric at 4/4 because g15's asymmetric attempt already lost
head-to-head and the chassis's BONUS=1.4 / MARGIN=0.45 math is
tuned around symmetric tech. stack stays at 0 - the strategy
doesn't lean on multi-army stacks and shifting points there would
muddy the move-vs-prod signal this descendant is trying to
isolate.`,
  tech: { move: 79, stack: 0, prod: 13, atk: 4, def: 4 },
};
