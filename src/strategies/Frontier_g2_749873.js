import Frontier_g1_0c6381 from "./Frontier_g1_0c6381.js";

// Hypothesis: parent loses to three Frontier variants in season #191
// (g2_461435, g3_69a9ba, g3_8c5891) — all of which share prod 40
// instead of parent's prod 50. That's a strong signal that prod 50 is
// slightly overinvested at this point in the lineage. Sibling
// g3_69a9ba opened the stack axis (stack 10, beat parent), but it
// changed three knobs at once (prod 50→40, stack 0→10, atk 30→20),
// so the stack contribution is confounded with the atk drop.
//
// Take exactly one step: pull 10 prod → 10 stack. Keep parent's
// atk 30 / def 20 (def 20 already won +32 over vanilla, and the
// 1.4x attacker bonus on tryKillAdjacent compounds with stack burst,
// so we don't want to give up atk in the same move). Front role
// delegates to Spearhead, which rewards burst — stack 10 should make
// front pushes crash harder against PressureSink-style braced tiles
// and tip the close Frontier-vs-Frontier games where parent finished
// #2/#3 within a few hundred ticks.
//
// Read: if rating climbs, stack→prod is the right axis from THIS
// parent and we should keep walking it. If it drops, parent's prod 50
// was load-bearing for the supply pump and the def-heavy build needs
// the prod to feed it.
export default {
  ...Frontier_g1_0c6381,
  name: "Frontier_g2_749873",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 30, def: 20 },
  description: "Frontier_g1_0c6381 with prod 50→40, stack 0→10: isolate the prod→stack lever to add Spearhead burst without touching atk/def.",
};
