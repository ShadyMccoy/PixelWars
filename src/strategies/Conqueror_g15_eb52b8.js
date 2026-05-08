import parent from "./Conqueror_g14_8d5369.js";

// Hypothesis (one knob, one reason): step tech back from the
// parent's 74/18 to 76/16 (== g14_f133b8's validated loadout).
// New tech: {move:76, stack:0, prod:16, atk:4, def:4}.
//
// Why:
//   - The parent's monotone-move->prod thesis just took five
//     consecutive losses in season #138 (seeds 245, 235, 225,
//     215, 205). Three of the five winners (g9_5c4555,
//     g7_efa4e0, g7_d17330) all run the OPPOSITE tech
//     {move:90, stack:0, prod:2, atk:4, def:4}. That isn't
//     noise - that's a clear signal the move->prod direction
//     does not extend monotonically. There is a sweet spot
//     somewhere on this axis and 74/18 is past it.
//   - The parent itself flagged this exact failure mode in its
//     own note: "If this regresses, the lineage optimum on this
//     chassis is most likely g14_f133b8's 76/16". 76/16 is the
//     LAST validated head-to-head winner on this trail (it beat
//     the parent's grandparent g13_b41df9 in season #137
//     seed=224). Stepping back one notch tests whether the
//     break happened between 76/16 and 74/18 (in which case
//     76/16 should reclaim its prior wins) or earlier (in
//     which case we'll need to step back further next iter).
//   - Mechanism for the break: the per-tick garrison floor on
//     lab1 (30x22 wrap, maxArmy 12) finally undershoots
//     consumption at move:74 during heavy-combat ticks. The
//     parent argued the sLimit<=0.5 guard cleanly no-ops those
//     ticks, but a no-op tick is still a tempo loss against
//     opponents whose move:90 chassis never undershoots. The
//     three head-to-head winners on 90/2 are precisely the
//     opponents that exploit this: they out-tempo the parent
//     during stretched fights.
//   - 76/16 is byte-identical to g14_f133b8's tech, which was
//     the immediate predecessor on this trail. Strategy code
//     stays inherited from the parent (which is itself
//     byte-identical to g13_b41df9's strategy). Only the tech
//     field changes, so this is a pure tech-rollback test
//     with no chassis interaction confound.
//
// Failure mode: if 76/16 also loses, the break is earlier on
// the axis than the previous data suggested - either the
// season #137 win was seed-luck or the metagame shifted as
// 90/2 cousins multiplied. Next iteration would then either
// step back further (78/14, 80/12) or pivot off the move/prod
// axis entirely toward a defensive shift (g11_cb02bc's
// defensive loadout also beat the parent in season #138
// seed=215).
export default {
  ...parent,
  name: "Conqueror_g15_eb52b8",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g14_8d5369 with tech rolled back one step on the move->prod axis: {move:76, stack:0, prod:16, atk:4, def:4} (== g14_f133b8's validated loadout).",
  summary: `Parent Conqueror_g14_8d5369 took five consecutive losses
in season #138 (seeds 245, 235, 225, 215, 205). Three of the five
winners - g9_5c4555, g7_efa4e0, g7_d17330 - all run the OPPOSITE
tech {move:90, stack:0, prod:2, atk:4, def:4}. That's strong
direct evidence that the parent's monotone-move->prod thesis broke
and 74/18 is past the sweet spot on this axis.

The parent's own note predicted this exact failure and named
the recommended rollback target: g14_f133b8's 76/16 as the most
likely lineage optimum on this chassis. 76/16 is the last
validated head-to-head winner on this trail (it beat the
grandparent g13_b41df9 in season #137 seed=224).

Mechanism: at move:74 the per-tick garrison floor on lab1
(30x22 wrap, maxArmy 12) finally undershoots consumption during
heavy-combat ticks. The sLimit<=0.5 guard no-ops those ticks
cleanly, but a no-op is still a tempo loss against move:90
chassis that never undershoot. The three 90/2 head-to-head
winners are exactly the opponents that exploit this gap.

Strategy code is byte-identical to the parent (inherited via
spread), which itself is byte-identical to g13_b41df9. Only the
tech field changes, so this is a pure single-knob rollback test
with no chassis interaction confound. If 76/16 also loses, the
next iteration should either step back further on the axis
(78/14, 80/12) or pivot to a defensive shift since g11_cb02bc's
defensive loadout also beat the parent in season #138 seed=215.`,
  tech: { move: 76, stack: 0, prod: 16, atk: 4, def: 4 },
};
