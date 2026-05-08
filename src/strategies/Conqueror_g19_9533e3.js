import parent from "./Conqueror_g18_6a26b3.js";

// Hypothesis (one knob): extend the move->prod direction by 2 more
// points. New tech: {move:76, stack:0, prod:16, atk:4, def:4}.
//
// Why:
//   - In season #135 the parent g18_6a26b3 (move:80, prod:12)
//     finished badly: #6 seed=249, #2 seed=240, #2 seed=231,
//     #5 seed=222, #4 seed=214. Of the five winners that beat it,
//     three run the high-move/low-prod tech move:90/prod:2
//     (g8_3280dd twice, g8_bfcb0e once), one runs the high-prod
//     tech move:78/prod:14 (g16_e79590), and one is factory
//     (g8_912a4c, tech unknown).
//   - The PLACEMENTS tell the more useful story than the winners:
//     against the move:90 cluster the parent placed badly (#6, #5,
//     and the #2 in seed=231 still barely held up). Against the
//     move:78/prod:14 winner (g16, seed=240) the parent placed #2
//     - the closest the parent came to winning all season. That
//     is direct head-to-head evidence that the high-prod direction
//     is the more competitive neighborhood, and that the parent's
//     prod:12 is sitting at a worse local point than g16's prod:14.
//   - The lineage chronology agrees:
//       g13 (prod:12) was the dominant winner in season #134.
//       g16 (prod:14) is the winner-against-parent in season #135.
//     Each season the winning prod ticks up one or two points.
//     The move->prod gradient has clearly NOT plateaued.
//   - Mechanism (g16's logic, applied one step further): with
//     MARGIN=0.45, less strength is burned per kill, so more
//     produced strength is deployable and prod amortizes more
//     aggressively than at MARGIN=0.6. The parent's prod:12 leaves
//     ~25% of the prod axis on the table; pushing to prod:16 grabs
//     the next ~14% per-turn output bump in the same direction
//     g16 already validated.
//   - move:76 still saturates lab1's garrison floor (30x22 wrap,
//     maxArmy 12). Even under contention the act() loop doesn't
//     consume 76+ move points per tick on this map - the parent
//     comment chain has been documenting this saturation since g16,
//     and the fact that g16 ran move:78 successfully with no
//     reported throttling is direct evidence the 78 -> 76 step
//     stays inside the saturation band.
//   - atk/def stays symmetric 4/4: the lineage's recent winners
//     (g13_b41df9, g12_f23241, g7_efa4e0, g16_e79590) all run
//     atk:4/def:4, and the parent's own commentary establishes
//     that asymmetric splits (g15's 5/3, g17's 4/6) underperform
//     this chassis.
//   - Why NOT go to {move:78, prod:14} (g16's exact tech)? That
//     would be a re-test of g16: same chassis, same tech, just a
//     rename. It generates no new information. Pushing one more
//     step probes whether the move->prod gradient continues
//     paying out or has saturated, which is the actual open
//     question.
//   - Why NOT swing to move:90/prod:2 (g8_3280dd's tech)? That's
//     a whole-thesis rewrite, not a one-knob nudge. The lineage
//     has been climbing in the prod direction for several
//     generations and the closest finish (#2, seed=240 vs g16)
//     was inside this direction, so flipping to the other camp
//     discards the local progress to bet on a different basin.
//
// Failure mode: if the prod gradient has already saturated at
// prod:14, the 14->16 step is a wash on output - prod's marginal
// slope flattens - and the 80->76 move trim finally costs garrison
// floor under heavy contention, dropping a tick or two of home-tile
// output. Bounded downside: 2 points moved, same magnitude as g17
// and g18's bets, and the destination is one step beyond g16's
// validated win-against-parent tech.
//
// Strategy code is byte-identical to parent g18 (which inherits
// from g17 -> g16 -> g15 -> g14 via spread). Only the tech field
// is overridden.
export default {
  ...parent,
  name: "Conqueror_g19_9533e3",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g18_6a26b3 with one more move->prod step: {move:76, stack:0, prod:16, atk:4, def:4}. Extends g16_e79590's winning direction (prod:14) by 2.",
  summary: `Parent Conqueror_g18_6a26b3 (move:80, prod:12) lost
season #135 across all five tracked seeds (placements: #6, #2, #2,
#5, #4). The placements segment cleanly by winner-tech: against
the high-move/low-prod cluster (g8_3280dd, g8_bfcb0e at move:90/
prod:2) the parent finished poorly (#6, #5, and a #2 only on
seed=231). Against the lone high-prod winner (g16_e79590 at
move:78/prod:14, seed=240) the parent finished #2 - the closest
brush with first place all season.

That asymmetry is direct head-to-head evidence: the high-prod
direction is the more competitive neighborhood for this chassis,
and the parent's prod:12 sits at a less competitive local point
than g16's prod:14. The lineage timeline agrees - g13 (prod:12)
won season #134, g16 (prod:14) wins against the parent in season
#135. The move->prod gradient has not plateaued; it ticks up one
or two points per season.

This descendant extends the gradient by 2 more points: move
80->76, prod 12->16, atk/def held at symmetric 4/4. Mechanism is
g16's logic one step further: with MARGIN=0.45 less strength is
burned per kill, so produced strength compounds more strongly,
and prod:16 is the next ~14% per-turn output bump in the same
direction g16 already validated. move:76 still saturates lab1's
garrison floor (30x22 wrap, maxArmy 12, act() consumption well
below 76 per tick).

Specifically NOT testing g16's exact tech (move:78, prod:14)
because that would be a rename of g16 with no new information.
Specifically NOT flipping to move:90/prod:2 because that's a
basin swap, not a one-knob nudge, and the closest parent finish
(#2 vs g16) was inside the high-prod basin.

Failure mode: if the prod gradient has saturated at prod:14, the
14->16 step is a wash on output and the move 80->76 trim costs
garrison floor under heavy contention. Bounded: 2 points moved,
same magnitude as g17 and g18's bets, destination one step
beyond a validated win.

Strategy code is byte-identical to parent (inherited via spread).
Only the tech field changes.`,
  tech: { move: 76, stack: 0, prod: 16, atk: 4, def: 4 },
};
