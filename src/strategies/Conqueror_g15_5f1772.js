import parent from "./Conqueror_g14_8d5369.js";

// Hypothesis (one knob, one reason): shift 1 point prod -> def on
// the parent's chassis, taking
//   {move:74, stack:0, prod:18, atk:4, def:4}
// to
//   {move:74, stack:0, prod:17, atk:4, def:5}.
//
// Why:
//   - Season #142 produced a clean A/B refutation of the parent's
//     prod=18 step. seed=217's winner was Conqueror_g21_e2aa5a,
//     which inherits BYTE-IDENTICAL strategy from the parent's
//     spread chain and only differs in tech:
//       parent : {move:74, prod:18, atk:4, def:4}
//       g21    : {move:76, prod:16, atk:4, def:4}
//     g21 won, parent finished #4 of 6. With code held constant
//     that head-to-head is a tech-only verdict that 76/16 beats
//     74/18 on this exact chassis. The parent's own spawn note
//     anticipated this: "if this regresses, the next iteration
//     should settle at g14_f133b8's 76/16 as the lineage optimum
//     on this chassis, OR pivot to a different axis (e.g. test a
//     small def shift since g11_cb02bc's defensive tech also beat
//     the parent in seed=240)."
//   - Settling at 76/16 with atk:4/def:4 would be byte-identical
//     to BOTH g14_f133b8 and g21_e2aa5a (same tech, same strategy
//     via the spread chain). A third bot at the same point in
//     tech-strategy space generates no new tournament signal -
//     two samples at that point already exist. The informative
//     move is the parent's documented Plan B: pivot to the def
//     axis.
//   - Mechanism: the parent's chassis pairs MARGIN=0.45 (tight
//     kill commits) with prod=18 (large per-tick reinforcement).
//     That combination produces fat home tiles AND fast saturation,
//     so the strategy is throughput-bound, not garrison-bound.
//     The losses that are NOT explained by the move/prod
//     saturation pattern are the asymmetric-atk and def-heavy
//     winners: seed=240 lost to g20_43253a (atk:5/def:3), and
//     g11_cb02bc (def:16) beat the broader lineage in season #137.
//     def:4 is a thin shell against an atk:5 commit; def:5 lifts
//     the parent's effective survival on contested tiles by ~25%
//     of the def slope (def slope is multiplicative on incoming
//     damage), which is enough to blunt the marginal asymmetric
//     attacker without giving up a meaningful prod tick (17 vs 18
//     produces 5.6% less per-turn strength - a small concession,
//     well below the seed-to-seed variance the lineage already
//     absorbs).
//   - Why NOT the more aggressive {move:74, prod:16, atk:4, def:6}?
//     Two-knob changes blur the signal. If def:5 alone recovers
//     ranking, the next iteration can extend to def:6. If def:5
//     fails, the move/prod axis question stays cleanly isolated
//     for the iteration after.
//   - Why NOT atk:5/def:3 (mirror g20_43253a/g6_53407c)? Already
//     refuted on this chassis - g21_e2aa5a (atk:4/def:4) beat
//     g20_43253a (atk:5/def:3) head-to-head in season #140 with
//     byte-identical strategy. Re-running that experiment on top
//     of prod=18 generates no new information about the def axis.
//   - Why NOT roll move/prod back to 76/16 paired with the def
//     shift? That bundles two tech edits and the move/prod edit is
//     the documented "Plan A". If both Plan A and Plan B are
//     applied at once, a future loss can't distinguish which knob
//     was wrong. Keeping move/prod at parent's 74/18 isolates the
//     def signal: if def:5 wins, the def axis is live; if it
//     loses, the next iteration cleanly tests 76/16 in isolation.
//
// Failure mode: if def:4 was already correct on this chassis and
// def:5 only diverts a prod tick away from kills without buying
// meaningful survivability, the bot loses a small amount of
// kill-cadence in offense-first matchups (mirror games against
// atk:4/def:4 cousins). Bounded downside: 1 point moved, change
// is along an axis the parent's own commentary flagged as the
// next experiment, and the prod concession (18 -> 17) is well
// inside the lineage's historical noise.
//
// Strategy code is byte-identical to parent (inherited via spread).
// Only the tech field changes.
export default {
  ...parent,
  name: "Conqueror_g15_5f1772",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g14_8d5369 with one tech point shifted prod->def: {move:74, stack:0, prod:17, atk:4, def:5}. Pivot from the saturated move/prod axis (g21_e2aa5a refuted parent's 74/18 at 76/16 head-to-head) to the def axis flagged in the parent's spawn note.",
  summary: `Parent Conqueror_g14_8d5369 (move:74, prod:18, atk:4,
def:4) lost season #142 seed=217 to Conqueror_g21_e2aa5a, which
inherits byte-identical strategy via the spread chain and only
differs in tech (move:76, prod:16, atk:4, def:4). With code held
constant that head-to-head is a tech-only verdict that the
parent's prod=18 step overshot the move/prod axis - the lineage
optimum on that axis is g14_f133b8's / g21_e2aa5a's 76/16, just
as the parent's spawn note predicted as the failure mode.

The parent's spawn note documented two possible responses to
that failure: settle at 76/16, or pivot to the def axis (citing
g11_cb02bc's def-heavy tech as another bot that beat the
lineage). Settling at 76/16 with the same atk/def loadout would
produce a bot byte-identical to both g14_f133b8 and g21_e2aa5a,
which adds no new tournament signal because two samples at that
exact tech-strategy point already exist. So this descendant
takes the documented Plan B: a single-knob shift of 1 point
prod->def, taking
  {move:74, stack:0, prod:18, atk:4, def:4}
to
  {move:74, stack:0, prod:17, atk:4, def:5}.

The change is single-knob from the parent and isolates the def
axis cleanly. move:74 stays so the move/prod axis question
remains intact for the next iteration; if def:5 recovers
ranking the def axis is the live experiment, if it doesn't the
next descendant tests 76/16 in isolation. atk:4/def:4 was
already validated as superior to atk:5/def:3 on this chassis
(g21_e2aa5a beat g20_43253a head-to-head in season #140 with
byte-identical strategy), so the asymmetric-atk direction is
not retested.

Mechanism: the parent's MARGIN=0.45 + prod=18 chassis is
throughput-bound, not garrison-bound (per-tick act() consumption
runs well under the move:74 garrison floor). The losses that
remain after explaining away the move/prod saturation are the
asymmetric-atk and def-heavy winners; def:4 is a thin shell
against an atk:5 commit, and bumping def:4->def:5 lifts
effective survival on contested tiles by ~25% of the def slope.
The prod concession (18->17) is a 5.6% per-turn reduction, well
inside the lineage's seed-to-seed variance.

Failure mode: if def:4 was correct on this chassis and def:5
only diverts a prod tick away from kills without meaningful
survivability gain, the bot loses a small amount of kill-cadence
in mirror matchups against atk:4/def:4 cousins. Bounded
downside: 1 point moved, axis explicitly flagged in the parent's
spawn note as the documented Plan B.

Strategy code is byte-identical to parent (inherited via
spread). Only the tech field changes.`,
  tech: { move: 74, stack: 0, prod: 17, atk: 4, def: 5 },
};
