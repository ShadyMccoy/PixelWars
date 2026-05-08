import parent from "./Conqueror_g14_8d5369.js";

// Hypothesis (one knob, tech only): shift 2 points move -> def.
// New tech: {move:72, stack:0, prod:18, atk:4, def:6}.
//
// Why:
//   - The parent g14_8d5369 (move:74, prod:18, def:4) finished
//     #5, #4, #3, #2, #2 across season #141's five tracked losses.
//     Competitive placement, but it never closes to #1. That
//     pattern is what g16_e79590's lineage descendants kept
//     hitting at the prod:14 step, and g17_6d0fb0 explicitly
//     tested "buy closing-exchange survival via def" as the
//     answer (def:4 -> def:6 at prod:12). g17 lost that bet,
//     but at prod:12 - a different output regime than the
//     prod:18 frontier the parent now sits on.
//   - The parent's own header explicitly flags this experiment
//     as the contingency: "if this regresses, the next iteration
//     should settle at g14_f133b8's 76/16 as the lineage optimum
//     on this chassis, or pivot to a different axis (e.g. test
//     a small def shift since g11_cb02bc's defensive tech also
//     beat the parent in seed=240)." Placement DID regress
//     (#5/#4/#3/#2/#2 vs prior generations), so we are in the
//     regression branch. Rather than reverting prod (which would
//     just be a rename of g14_f133b8 with no new information),
//     this descendant tests the def-pivot suggestion at the
//     prod:18 frontier the parent never got to combine with def:6.
//   - Why take from move and not from prod? prod:18 is the
//     validated lineage frontier - prod:14 -> 16 -> 18 was a
//     monotone winning ratchet (g16, g19, parent). Trimming prod
//     to fund def conflates two changes (regression on prod AND
//     test of def). Trimming move keeps the test clean: only the
//     def axis moves, prod stays at 18. The parent's header also
//     argues move is already at the saturation edge - "move:74
//     keeps the garrison floor comfortably above what the strategy
//     actually consumes" - so a 2-point trim to move:72 should
//     stay inside the saturation band, with the failure mode being
//     mild tempo loss on heavy-combat ticks (cleanly handled by
//     the existing sLimit<=0.5 guard / Conqueror.act fallback).
//   - Why def:6 specifically and not def:5 or atk:6? def:6 is the
//     same magnitude g17_6d0fb0 tried and is the round-number
//     comparable point - if def matters at this output regime,
//     def:6 is enough to show it. Asymmetric atk shifts have
//     repeatedly underperformed in this lineage (g15's offense
//     asymmetry lost to g16's revert; g17's defense asymmetry
//     also lost). Symmetric variants are the historical winners,
//     so this is specifically testing whether the symmetry-vs-
//     asymmetry rule still holds when prod is high enough to
//     amortize def's tempo cost - or whether high prod is
//     precisely the regime where defensive asymmetry finally
//     pays off. Either result is informative.
//
// Mechanism: at prod:18 the bot generates more strength per turn
// than it can deploy through any single edge (maxArmy:12 caps the
// per-tile reservoir). The bottleneck for placement-to-#1 is
// keeping captured tiles against retake mass - exactly where def's
// absorption slope helps and where g17 tried to go but couldn't
// afford the prod cost. By holding prod:18 (no output regression)
// and funding def from the saturated move axis, we get g17's
// defensive bet without paying g17's tempo penalty.
//
// Failure mode: if move:72 finally undershoots the per-tick
// garrison demand on lab1's 30x22 wrap with maxArmy:12, the bot
// pumps its home tile an extra tick instead of attacking. That's
// a tempo loss, not a structural break - the sLimit<=0.5 guard
// cleanly no-ops low-power ticks via the existing Conqueror.act
// fallback chain. Or, if the def slope at 4->6 still can't close
// the ~0.5-1.0 strength gap that decides the parent's #2 finishes
// (the same gap g17 couldn't close at prod:12), we lose tempo
// without buying survival, and the next iteration should pivot
// to a strategy-side change (e.g. raising RETAKE_VETO above 1.5
// to convert prod:18's surplus into more aggressive kill commits).
//
// Strategy code is byte-identical to the parent (inherited via
// spread, which itself spreads from g13_b41df9). Only the tech
// field changes.
export default {
  ...parent,
  name: "Conqueror_g15_2c15dc",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g14_8d5369 with 2 points shifted move -> def: {move:72, stack:0, prod:18, atk:4, def:6}. Holds the prod:18 lineage frontier and tests the parent's own def-pivot suggestion at high output.",
  summary: `Parent Conqueror_g14_8d5369 (move:74, prod:18, def:4)
finished #5, #4, #3, #2, #2 across season #141's five tracked
losses - competitive placement, never closing to #1. Two losses
were to the high-move basin (g5_edeed5, move:90/prod:2), one to
the same tech with a different chassis (g14_5ae6c0), one to a
mid-tech bot (g18_6a26b3, move:80/prod:12), one to a factory
bot. Placement is the failure mode, not catastrophic loss.

The parent's own header flags exactly this contingency: "if this
regresses, the next iteration should settle at g14_f133b8's
76/16 as the lineage optimum on this chassis, or pivot to a
different axis (e.g. test a small def shift since g11_cb02bc's
defensive tech also beat the parent in seed=240)." Placement
did regress, so we're in the regression branch. Reverting prod
would just rename g14_f133b8; pivoting to the def axis at the
prod:18 frontier is the new-information experiment.

This descendant takes 2 points from move (already at saturation
edge per the parent's own analysis) and puts them into def.
prod stays at 18 - the validated lineage frontier from the
prod:14 -> 16 -> 18 ratchet. Atk stays at 4. The change is a
clean single-axis test: only def moves, only prod stays.

Mechanism: at prod:18 the bot produces more strength than it can
deploy through any single edge under maxArmy:12. The bottleneck
for placement-to-#1 is retaining captured tiles against retake
mass - exactly where def's absorption slope helps. g17_6d0fb0
made the same defensive bet at prod:12 and lost (the def:6 floor
cost more output tempo than it bought in absorption), but at
prod:18 there's no prod-side regression to absorb: the def:6
shift is funded entirely by the saturated move axis.

Failure mode: if move:72 undershoots the per-tick garrison
demand on lab1, the bot pumps its home tile an extra tick
instead of attacking - tempo loss, cleanly handled by the
existing sLimit<=0.5 guard. Or, if the def slope at 4->6 still
can't close the ~0.5-1.0 strength gap that decides #2 finishes,
we lose tempo without buying survival, and the next iteration
should pivot to a strategy-side change instead (e.g. raising
RETAKE_VETO from 1.5 to convert prod:18's surplus into more
aggressive kill commits).

Strategy code is byte-identical to parent (inherited via spread).
Only the tech field changes.`,
  tech: { move: 72, stack: 0, prod: 18, atk: 4, def: 6 },
};
