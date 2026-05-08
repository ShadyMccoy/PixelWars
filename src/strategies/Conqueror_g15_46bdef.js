import parent from "./Conqueror_g14_8d5369.js";

// Hypothesis (one knob, one reason): roll the move->prod axis back
// one step to {move:76, prod:16} — g14_f133b8's tech.
//
// Why:
//   - The parent g14_8d5369 sits at {move:74, prod:18}, the third
//     step on the 80/12 -> 78/14 -> 76/16 -> 74/18 hill-climb. Each
//     of the first two steps had direct head-to-head wins on its
//     immediate predecessor (g16_e79590 over g13_b41df9 at 78/14,
//     g14_f133b8 over g13_b41df9 at 76/16). The 74/18 step has no
//     such win on record — it was projected from the trail, not
//     measured.
//   - Season #138 shows the parent at 74/18 finishing 5/6, 3/6,
//     4/6, 2/6, 5/6 across five seeds — losing to a mix of 90/2
//     cousins (g9_5c4555, g7_efa4e0, g7_d17330) and factory bots
//     (g11_cb02bc, g18_6a26b3). That's exactly the failure mode
//     the parent's own comment predicted: "if this regresses, the
//     next iteration should settle at g14_f133b8's 76/16 as the
//     lineage optimum on this chassis." The parent was honest
//     about its falsifier; the season fired it.
//   - 76/16 is the last step on the trail with a win in the
//     record. Stepping back to it is the smallest possible
//     hypothesis-driven move: if the trail saturated between 76/16
//     and 74/18, the lineage's tech optimum on this chassis is
//     76/16 and we should re-anchor there before exploring a new
//     axis. If 74/18 was actually fine and the parent's losses
//     were noise, this descendant will tie or lose to its parent
//     in the next season and we'll know to look elsewhere (e.g. a
//     small def shift since g11_cb02bc's defensive loadout also
//     beat the parent at seed=215).
//   - Strategy code stays byte-identical (inherited via spread).
//     The knob being tested is exactly tech, nothing else, so the
//     season measures the tech delta cleanly.
//
// Failure mode: if 74/18 was the right tech and 76/16 is a real
// regression, this descendant will lose to the parent on lab1.
// That's still informative — it confirms 74/18 as the trail's
// stable point and says the loss pattern in season #138 was either
// noise or driven by something other than tech (target selection
// against the 90/2 cousins, or whatever the factory bots are
// doing).
export default {
  ...parent,
  name: "Conqueror_g15_46bdef",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g14_8d5369 with tech rolled back one step to g14_f133b8's {move:76, stack:0, prod:16, atk:4, def:4}.",
  summary: `Parent Conqueror_g14_8d5369 sits at the third step of the
80/12 -> 78/14 -> 76/16 -> 74/18 move->prod hill-climb. The first
two steps each had direct head-to-head wins on their immediate
predecessor (g16_e79590 at 78/14, g14_f133b8 at 76/16); the 74/18
step did not — it was extrapolated, not measured.

Season #138 fired the parent's own falsifier: at 74/18 the parent
finished 5/6, 3/6, 4/6, 2/6, 5/6 across five seeds, losing to a
mix of 90/2 cousins (g9_5c4555, g7_efa4e0, g7_d17330) and factory
bots (g11_cb02bc, g18_6a26b3). The parent's comment explicitly
called this case: "if this regresses, the next iteration should
settle at g14_f133b8's 76/16 as the lineage optimum on this
chassis."

This descendant takes that path. Tech rolls back exactly one step
to {move:76, stack:0, prod:16, atk:4, def:4} — the last point on
the trail with a head-to-head win in the record. Strategy code is
byte-identical to the parent (inherited via spread); only the tech
field changes, so the season measures the tech delta cleanly.

If 76/16 wins, the lineage tech optimum on this chassis is
confirmed and the next iteration should pivot to a different axis
(small def shift suggested by g11_cb02bc's loadout, or a strategy-
code change targeting the 90/2 cousins' kill priority).
If 74/18 wins this matchup, the season #138 losses were noise or
chassis-mismatch rather than tech overshoot, and the next
iteration should look at strategy code rather than tech.`,
  tech: { move: 76, stack: 0, prod: 16, atk: 4, def: 4 },
};
