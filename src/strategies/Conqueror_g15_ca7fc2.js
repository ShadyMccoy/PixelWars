import parent from "./Conqueror_g14_8d5369.js";

// Hypothesis (one knob): revert one prod gradient step.
// New tech: {move:76, stack:0, prod:16, atk:4, def:4}.
//
// Why:
//   - Season #141 disconfirmed the parent's prod:18 bet. The
//     parent finished outside #1 in five tracked seeds:
//       seed=249 #5/6 (winner g5_edeed5, move:90/prod:2)
//       seed=246 #4/6 (winner g18_6a26b3, move:80/prod:12)
//       seed=235 #3/6 (winner g14_5ae6c0, move:74/prod:18)
//       seed=230 #2/6 (winner g15_eb52b8, factory)
//       seed=227 #2/6 (winner g5_edeed5, move:90/prod:2)
//     Three of four known-tech winners ran LOWER prod than the
//     parent. Two ran prod:2 (the high-move basin), one ran
//     prod:12 (the historic g13 basin). Only g14_5ae6c0 matched
//     prod:18, and only in 1/5.
//   - The parent's own header explicitly identified the revert
//     path: "the lineage optimum on this chassis is most likely
//     g14_f133b8's 76/16, and the next iteration should pivot
//     to a different axis." Season #141 is exactly the
//     regression case it predicted, so we follow the parent's
//     own fallback.
//   - 76/16 is empirically validated head-to-head: g14_f133b8
//     beat g13_b41df9 (the strategy chassis grandparent) in
//     season #137 seed=224 with byte-identical strategy code,
//     differing only in tech. That datum stands independent of
//     the prod:18 gradient experiment - 16 is the last prod
//     step on this chassis with a direct head-to-head win.
//   - Why not jump further (e.g., back to prod:12 to match
//     g18_6a26b3, the strongest non-basin-swap winner against
//     the parent)? That's a two-step revert. The disciplined
//     one-knob nudge is one step. If 76/16 also regresses next
//     season, prod:12 is the next fallback; if it holds, we've
//     found the lineage optimum and the next experiment should
//     pivot off the move/prod axis entirely (e.g., a small def
//     shift, since g11_cb02bc's defensive tech also beat the
//     g13 lineage).
//   - Why not basin-swap to move:90/prod:2 to match g5_edeed5
//     (which won 2/5)? That discards every prod-direction win
//     from g16 onward and is a different kind of experiment.
//     Worth trying in a separate descendant, not here.
//   - Mechanism for the revert: at MARGIN=0.45 the prod slope
//     is recursive in deployable strength, but it isn't
//     literally infinite - somewhere it has to stop paying out
//     because per-tile maxArmy=12 caps absorption and move:74
//     finally undershoots the per-tick garrison demand on
//     heavy-combat ticks. The parent bet that the cap was past
//     prod:18; the data says the cap is at or before it. One
//     step back puts us inside the validated zone.
//
// Symmetric atk/def stays at 4/4 because the chassis's
// needed-strength math is keyed off BONUS=1.4 and every recent
// winner in this lineage runs symmetric (g13, g14_f133b8,
// g14_5ae6c0, g18_6a26b3 all 4/4).
//
// Failure mode: if the prod gradient was actually still paying
// at 18 and the season #141 losses were noise (or a strategy
// chassis issue, since g14_5ae6c0 with identical prod:18 tech
// did beat the parent in seed=235), reverting costs ~6% per-turn
// output. Bounded: only one tech step moved, revert path is
// clear (back to prod:18 or pivot to chassis grafting from
// g14_5ae6c0). The g14_5ae6c0 datum is the one piece of evidence
// that argues against this revert; it's outweighed by 3/4 winners
// running lower prod and the parent's own predicted failure mode.
//
// Strategy code is byte-identical to parent (inherited via
// spread). Only the tech field changes.
export default {
  ...parent,
  name: "Conqueror_g15_ca7fc2",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g14_8d5369 with one prod gradient step reverted: {move:76, stack:0, prod:16, atk:4, def:4}. Matches g14_f133b8, the parent's stated lineage-optimum fallback.",
  summary: `Parent Conqueror_g14_8d5369 ran tech {move:74, prod:18}
and lost season #141 in five tracked seeds, finishing #5, #4, #3,
#2, #2. Three of four known-tech winners ran LOWER prod than the
parent (g5_edeed5 prod:2 in seeds 249/227, g18_6a26b3 prod:12 in
seed 246), and only one matched prod:18 (g14_5ae6c0 in seed 235).
The prod:18 gradient extension regressed.

The parent's own header explicitly named the revert path: "the
lineage optimum on this chassis is most likely g14_f133b8's
76/16." That's exactly this descendant's tech. g14_f133b8 beat
g13_b41df9 head-to-head in season #137 seed=224 with
byte-identical strategy code, differing only in tech. So 76/16
is the last prod allocation on this chassis with a direct
head-to-head win - independent of the prod:18 experiment.

This is a one-step revert (prod 18 -> 16, move 74 -> 76), not a
two-step revert to g13's prod:12 or a basin swap to g5_edeed5's
move:90/prod:2. The disciplined one-knob nudge gets us inside
the empirically validated zone without discarding the gradient
work that won g16 (prod:14), g14_f133b8 (prod:16), and earlier.

Mechanism: at MARGIN=0.45 the prod slope is recursive in
deployable strength but cannot be literally infinite -
maxArmy=12 caps absorption and the move:74 floor eventually
undershoots per-tick garrison demand on heavy-combat ticks. The
parent bet the cap was past prod:18; the season #141 evidence
puts the cap at or before it.

atk/def stays at symmetric 4/4 - every recent winner in this
lineage (g13, g14_f133b8, g14_5ae6c0, g18_6a26b3) runs symmetric
because the chassis's needed-strength math is keyed off BONUS=1.4.

The one piece of evidence against this revert is that g14_5ae6c0
runs the parent's exact prod:18 tech and still beat the parent
in seed=235. That suggests the chassis (inherited via spread vs
g14_5ae6c0's explicit hemisphere code) might be the actual
differentiator, not tech. But 3/4 winners running lower prod
weighs more than 1/4 winners matching, and the parent's own
predicted failure mode says revert before chassis-graft.

Failure mode: if prod:18 was actually still paying out and the
losses were noise / chassis issue, this loses ~6% per-turn output.
Bounded: revert path is clear - either back to prod:18 with a
chassis graft from g14_5ae6c0, or further down to prod:12.

Strategy code is byte-identical to parent (inherited via spread).
Only the tech field changes.`,
  tech: { move: 76, stack: 0, prod: 16, atk: 4, def: 4 },
};
