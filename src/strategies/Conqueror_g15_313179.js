import parent from "./Conqueror_g14_8d5369.js";

// Hypothesis (one knob, tech only): trade 1 move point for 1 def
// point. New tech: {move:73, stack:0, prod:18, atk:4, def:5}.
//
// Why:
//   - Of the parent's 5 tracked season-#140 losses, 2 were to
//     move:90/prod:2 blitz bots (g6_b70bfa seed 246, g7_d17330
//     seed 235) and 1 went to a same-tech sibling (g14_5ae6c0
//     seed 249) with the more-elaborate Pass 1 hemisphere
//     chassis. The first two are pure mobility-pressure
//     matchups: they trade many small attacks per tick and rely
//     on raw kill cadence. Against a prod:18 rear we can't
//     out-blitz them - but we CAN make every one of their kills
//     against us cost more strength.
//   - def is keyed multiplicatively into the engine's effective
//     BONUS on the defending side. One point of def (4->5) is
//     ~5% more defender strength on every incoming attack. For
//     a blitz opponent firing many small probes per tick this
//     compounds: each probe needs ~5% more sLimit to clear our
//     tile, so a fraction of their attacks fall *under* the
//     kill ceiling and stall instead of converting.
//   - The parent's own comment chain explicitly flagged this
//     pivot: "the next iteration should ... pivot to a
//     different axis (e.g. test a small def shift since
//     g11_cb02bc's defensive tech also beat the parent in
//     seed=240)." This descendant is that defensive shift,
//     scoped to a single point so the rest of the regime is
//     preserved.
//   - Why steal from move and not prod? The parent comment
//     argues lab1's 30x22 wrap / maxArmy 12 garrison floor is
//     saturated at move:74 ("per-tick act() movement
//     consumption runs well under 76 even in heavy combat").
//     Trimming one more point (74->73) stays inside that
//     saturation band by every continuity argument the lineage
//     has documented since g16. prod:18 is the experimental
//     gradient and should not be perturbed in the same step.
//   - Why not steal from atk? The chassis's needed-strength
//     math is keyed off the literal BONUS=1.4 constant. atk
//     adjustments would skew our offensive math against
//     symmetric-tech opponents (we'd either over- or
//     under-commit on every kill). Holding atk at 4 keeps the
//     hardcoded 1.4 calibrated for our attacks while still
//     getting a defender-side multiplier from def:5.
//   - Strategy code byte-identical to parent (inherited via
//     spread of g14_8d5369, which itself spreads g13_b41df9).
//
// Failure mode: if def slope is too gentle to matter at the
// 4->5 step (the engine's def curve could be near-linear at low
// values), the change is a pure wash and the lineage learns
// "1-point def shifts don't move the needle on lab1 at this
// chassis." The cost is one tick of less garrison ceiling, but
// at move saturation that tick is not load-bearing. If the
// blitz loss share stays the same in the next season, the next
// iteration should try a larger def shift (4->6, paired against
// move 74->72) or pivot off the defensive axis entirely. If
// blitz losses drop but new losses appear against same-prod
// siblings, the bottleneck was elsewhere (likely the strategy
// chassis vs g14_5ae6c0's hemisphere Pass 1).
export default {
  ...parent,
  name: "Conqueror_g15_313179",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g14_8d5369 with one move->def point shifted: {move:73, stack:0, prod:18, atk:4, def:5}. Strategy code unchanged.",
  summary: `Parent Conqueror_g14_8d5369 lost 5 tracked seeds in
season #140. Two losses (seeds 246, 235) went to move:90/prod:2
blitz bots that out-trade the parent's prod-heavy chassis on raw
kill cadence. One loss (seed 249) went to same-tech sibling
g14_5ae6c0, which differs only by running the explicit
hemisphere/walk-all-candidates Pass 1 chassis. The blitz losses
are the more diagnostic signal because they implicate a defensive
weakness, not a strategy gap.

This descendant moves one point from move to def:
move 74->73, def 4->5. The hypothesis is that one extra point of
def (~5% better defender multiplier on every incoming attack)
disproportionately hurts blitz opponents whose probe attacks sit
near the kill ceiling: a fraction of their probes that would have
converted will now stall, dropping their per-tick conversion rate
without affecting the standoffs we already win.

atk held at 4 deliberately. The chassis's needed-strength math
hardcodes BONUS=1.4 and is calibrated for the symmetric atk/def
case; perturbing atk would skew our offensive math against the
many symmetric-tech opponents in the field. def is the safer side
to perturb because the BONUS constant only multiplies the
attacker's strength in the engine - holding atk at 4 keeps every
"can I kill this neighbor?" check correct against the standard
def:4 baseline that most opponents run.

prod:18 unchanged. The lineage's prod gradient is the experimental
axis and shouldn't be perturbed in the same iteration as a
defensive pivot. move 74->73 stays inside the saturation band the
lineage has been documenting since g16 (per-tick act() consumption
on lab1 30x22 wrap / maxArmy 12 runs well under 76 even in heavy
combat).

Strategy code byte-identical to the parent via spread inheritance.
Only the tech field changes. Failure mode is a wash if def's
engine slope is too gentle at low values, in which case the next
iteration should escalate to a 2-point shift or pivot off the
defensive axis. The parent's own commentary explicitly suggested
this defensive pivot as the natural next step if its prod:18
extension regressed.`,
  tech: { move: 73, stack: 0, prod: 18, atk: 4, def: 5 },
};
