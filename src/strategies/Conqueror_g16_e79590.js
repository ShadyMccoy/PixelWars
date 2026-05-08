import parent from "./Conqueror_g15_e978b4.js";

// Hypothesis (one knob): revert parent's def->atk swap and extend
// g13_b41df9's signature move->prod direction by 2 more points.
// New tech: {move:78, stack:0, prod:14, atk:4, def:4}.
//
// Why:
//   - Parent g15_e978b4 deviated from g14_7d3830 only by tech
//     (atk/def 4/4 -> 5/3). In season #131 seed=249 the parent
//     finished #6 of 6 against its own symmetric cousin g13_b41df9
//     (identical chassis, atk:4/def:4). That is a direct
//     head-to-head signal that the asymmetric offense bet did not
//     pan out: def:3 widens opponents' kill ceiling against us by
//     the same proportion it widens ours, and against a
//     same-chassis cousin the trade is a wash on output but a
//     loss on incoming.
//   - g13 itself won against g12 by adopting g10_cbab8a's tech
//     move 90->80 / prod 2->12. g10's rationale was that with
//     MARGIN=0.45 less strength is burned per kill, so a larger
//     fraction of produced strength is deployable and prod
//     amortizes more strongly than at MARGIN=0.6. That logic
//     applies identically here - this descendant extends the
//     move->prod direction by 2 more points: move 80->78,
//     prod 12->14.
//   - move:78 still saturates lab1's garrison floor (30x22 wrap,
//     maxArmy 12). Per-turn act() consumption on this map runs
//     well below 80 even in heavy combat, so trimming 2 move to
//     fund 2 more prod should buy ~15% more deployable strength
//     with no kill-cadence cost.
//   - atk/def reverts to 4/4 because g15's head-to-head loss
//     against its 4/4 cousin says the symmetric variant is
//     stronger here, and 4/4 keeps the chassis's BONUS=1.4
//     needed-strength math symmetric the way the offense-first
//     decision tree was originally tuned to assume.
//
// Failure mode: if move:78 actually under-shoots per-turn
// garrison demand on lab1, the bot spends a tick or two
// re-pumping its home tile instead of attacking. The Pass 4
// tryNoMarginKill safety net is gated on army.attackPower, so a
// low-power tick just no-ops cleanly - downside is a mild tempo
// loss, not a structural break.
//
// Strategy code is byte-identical to parent g15 (which inherits
// from g14 via spread). Only the tech field is overridden.
export default {
  ...parent,
  name: "Conqueror_g16_e79590",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g15_e978b4 with tech reverted to symmetric atk/def and extended one more move->prod step: {move:78, stack:0, prod:14, atk:4, def:4}.",
  summary: `Parent Conqueror_g15_e978b4 deviated from g14_7d3830
only by tech (atk/def 4/4 -> 5/3). In season #131 seed=249 the
parent finished #6 of 6 against its own symmetric cousin
g13_b41df9 (identical chassis, atk:4/def:4). That head-to-head
signal says the asymmetric offense bet does not pay off in this
chassis: def:3 widens opponents' kill ceiling against us by the
same proportion it widens ours, and against same-chassis cousins
the trade is a wash on output but a loss on incoming.

g13 itself won by adopting g10_cbab8a's tech move 90->80 /
prod 2->12. The MARGIN=0.45 reasoning - less margin means more
deployable strength, so prod compounds more strongly - applies
identically here. This descendant continues the move->prod
direction by 2 more points: move 80->78, prod 12->14, with
atk/def restored to symmetric 4/4.

move:78 still saturates lab1's garrison floor (30x22 wrap,
maxArmy 12). Per-turn act() consumption runs well below 80 even
in heavy combat, so trimming 2 move to fund 2 more prod should
buy ~15% more deployable strength without losing kill cadence.
atk/def back to 4/4 keeps the chassis's BONUS=1.4 needed-strength
math symmetric.

Strategy code is byte-identical to parent g15 (which inherits
from g14 via spread). Only the tech field changes.`,
  tech: { move: 78, stack: 0, prod: 14, atk: 4, def: 4 },
};
