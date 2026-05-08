import Frontier from "./Frontier.js";

// Hypothesis: parent's def:10 swap (g2) recovered +209 rating over the
// atk:60 sibling and beat vanilla, so the def axis is clearly under-
// invested in this lineage. Recent losses still came from Frontier's
// Spearhead (swap math when defending) and PressureSink's brace tiles
// (we can't out-atk a high-pressure SINK, only outlast it). Push one
// more notch in the same direction: shift 5 atk → 5 def. Keep prod at
// 40 so the supply pump matches vanilla. Expect this to soften the
// defender swap math a bit further without meaningfully hurting our
// own Spearhead pushes (atk:45 still gets the 1.4x attacker bonus on
// kill-or-stay). If the rating moves up, def is still under-shot; if
// it drops, g2's def:10 was the local optimum.
export default {
  ...Frontier,
  name: "Frontier_g3_8c5891",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 45, def: 15 },
};
