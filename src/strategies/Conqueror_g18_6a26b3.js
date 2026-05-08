import parent from "./Conqueror_g17_6d0fb0.js";

// Hypothesis (one knob): shift 2 points def -> move.
// New tech: {move:80, stack:0, prod:12, atk:4, def:4}.
//
// Why:
//   - Parent g17_6d0fb0 bet that prod 14 -> 12 + def 4 -> 6 would
//     turn its "#2 of 6 in four of five losses" pattern (g16, season
//     #133) into a #1 by buying closing-exchange survival. Season
//     #134 said no. The parent finished #4 of 6 in three of five
//     losses (seeds 246, 211, 194), #3 once (seed 186), and #2 only
//     once (seed 220). That is a regression in placement, not an
//     improvement: the def:6 floor cost more output tempo than it
//     bought in absorption.
//   - The cleanest evidence is seed=246 itself. The winner there
//     was Conqueror_g13_b41df9, which runs tech
//     {move:80, stack:0, prod:12, atk:4, def:4}. That is the parent's
//     own tech with EXACTLY this descendant's two-point shift
//     reverted: +2 move, -2 def, prod and atk identical at 12 and 4.
//     g13 won the head-to-head against the parent on a similar
//     hemisphere-weighted Pass-1 + path-clear-Pass-3 chassis. So we
//     have direct head-to-head evidence that the move:80/def:4 split
//     beats the parent's move:78/def:6 split when prod:12/atk:4 is
//     held constant.
//   - Mechanism: move is a garrison-floor knob. At lab1's 30x22 with
//     maxArmy 12, move:78 and move:80 both saturate the floor in
//     practice, but the marginal ~2 points of headroom keep the
//     act() loop from ever throttling under contention. Meanwhile
//     def is an output multiplier on incoming-damage absorption; at
//     def:4 vs def:6 the survivor on a captured tile changes by less
//     than the BONUS=1.4 / MARGIN=0.45 system tolerances care about,
//     because the close exchanges that g16 was losing #2 in were
//     decided by a ~0.5-1.0 strength gap that the def slope at this
//     range can't close. The parent's def:6 was paying for itself
//     against retake mass in only a thin band of fights.
//   - The parent's failure mode (offered explicitly in g17's header):
//     "if prod was actually still compounding strongly at the prod:14
//     step, output drops ~14% per turn and the bot loses the tempo
//     edge that puts it at #2 in the first place." Season #134's
//     placement regression suggests that exact failure mode triggered
//     - placements got WORSE, not better. But rather than reverting
//     prod (back to 14) and undoing g13's validated prod:12 lesson,
//     this descendant reverts the OTHER half of the parent's two-knob
//     bet: hold prod at 12 (g13's allocation), and put the freed
//     points back into move where g13 also runs them.
//
// Symmetry: atk/def returns to 4/4 (no asymmetry). g15's loss
// established that offense-leaning asymmetry hurts on this chassis;
// g17 banked on defense-leaning asymmetry being the inverse, but
// the data didn't bear that out at the def:4 -> def:6 step.
// Symmetric atk:4/def:4 keeps the kill-band math identical to
// every recent winner in this lineage (g13_b41df9, g12_f23241,
// g7_efa4e0 all run atk:4/def:4).
//
// Failure mode: if the def:6 floor was actually doing real work
// in seed=220 (the one #2 finish) and that's the matchup we should
// be optimizing for, we lose ~0.5 absorption per incoming hit and
// drop from #2 to #3-#4 in similar fields. Bounded downside: only
// 2 points moved, exact same magnitude as g17's change, and the
// destination (move:80/def:4) is empirically validated by g13's
// season #134 win against the parent.
//
// Strategy code is byte-identical to parent (inherited via spread
// from g17, which inherits from g16). Only the tech field changes.
export default {
  ...parent,
  name: "Conqueror_g18_6a26b3",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g17_6d0fb0 with 2 points shifted def -> move: {move:80, stack:0, prod:12, atk:4, def:4}. Matches g13_b41df9's tech, which beat the parent in seed=246.",
  summary: `Parent Conqueror_g17_6d0fb0 bet that shifting prod 14 ->
12 and def 4 -> 6 would convert g16's "#2 of 6 in four of five
losses" pattern into a #1 by buying closing-exchange absorption.
Season #134 disconfirmed that bet: the parent finished #4 of 6 in
three of five losses (seeds 246, 211, 194), #3 once (seed 186),
and #2 only once (seed 220). Placement got worse, not better.

The most informative loss is seed=246, where Conqueror_g13_b41df9
won. g13's tech is {move:80, stack:0, prod:12, atk:4, def:4} -
identical to the parent on prod and atk, but with the exact
two-point shift this descendant performs (def 6 -> 4, with the
freed points going to move 78 -> 80). g13 ran on a similar
hemisphere-weighted Pass-1 + path-clear Pass-3 chassis and beat
the parent head-to-head, so we have direct evidence that
move:80/def:4 outperforms move:78/def:6 at prod:12/atk:4.

Mechanism: at this allocation range, move's garrison-floor
saturation matters less than def's absorption matters, because
the close exchanges g16 was losing #2 in were decided by gaps
the def slope at 4 -> 6 can't close. The parent's predicted
failure mode (output drop costing the tempo edge that puts the
bot at #2 in the first place) appears to have triggered: the bot
fell from "#2 of 6 in four of five" to "#4 of 6 in three of five."

Rather than reverting the parent's prod:12 (which g13's win also
validates as the correct prod allocation in this lineage at
MARGIN=0.45), this descendant reverts only the def half of the
two-knob bet. atk/def returns to 4/4, matching every recent winner
in the lineage (g13_b41df9, g12_f23241, g7_efa4e0). Symmetric tech
keeps the kill-band math invariant against cousins running BONUS=1.4.

Failure mode: if seed=220's #2 finish was specifically rescued by
def:6's absorption, we lose ~0.5 per incoming hit there and drop a
slot. Bounded: only 2 points moved, same magnitude as g17's bet,
and the destination is empirically validated by g13's season #134
win against this exact parent.

Strategy code is byte-identical to parent (inherited via spread).
Only the tech field is overridden.`,
  tech: { move: 80, stack: 0, prod: 12, atk: 4, def: 4 },
};
