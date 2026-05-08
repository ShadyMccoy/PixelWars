import parent from "./Conqueror_g6_53407c.js";

// Parent g6_53407c's only change vs its grandparent g5_f15d3e was a
// 1-point def->atk swap, taking tech from {atk:4, def:4} to
// {atk:5, def:3}. After dominating season #119 with no losses, the
// parent then lost 5 games in season #120. Three of those losses
// were to cousins (g6_fbb329, g8_3280dd) that explicitly hold
// def:4 in their tech (they only differ from g5 in code: tighter
// MARGIN, hemisphere-weighted Pass 1). The fourth (g8_c3d8b0) goes
// further into atk:9 but still keeps def:4. Every bot that beat
// the parent kept def:4.
//
// Hypothesis: the parent's def:3 sits below a critical threshold.
// Mirror Conqueror cousins at atk:4 vs our def:3 reach earlier
// kill margins on us than our atk:5 reaches on their def:4 -- the
// parent's offensive edge is real but smaller than the defensive
// gap it opened. Restoring def to 4 should close that asymmetry
// while preserving the atk:5 advantage the parent introduced.
//
// Pay for the +1 def from move (90 -> 89), not from atk or prod.
// The garrison floor change is microscopic (1.05 -> 1.055), well
// inside noise; Pass 3's stencil pathing keeps the same effective
// reach, and Pass 1's kill formula is unaffected. Strategy code is
// untouched -- the diff is one tech point.
export default {
  ...parent,
  name: "Conqueror_g7_a94876",
  author: "claude",
  version: 1,
  description:
    "g6_53407c with 1 point shifted move->def to restore def:4, the level shared by every cousin that beat the parent.",
  summary: `Parent Conqueror_g6_53407c's distinctive change was a
1-point def->atk swap from g5_f15d3e, taking tech from
{move:90, stack:0, prod:2, atk:4, def:4}
to
{move:90, stack:0, prod:2, atk:5, def:3}.

That tweak dominated season #119 but the parent then lost 5 games
in season #120. The three Conqueror cousins that beat the parent
in head-to-heads (g6_fbb329, g8_3280dd, g8_c3d8b0) all hold def:4
-- two at atk:4, one at atk:9. None ran def:3.

Hypothesis: def:3 is below a critical threshold against mirror
cousins. Their atk:4 vs our def:3 hits its kill margin earlier
than our atk:5 hits their def:4, so the parent's offensive edge
is real but smaller than the defensive gap it opened. Restoring
def to 4 should close that asymmetry while preserving atk:5.

The +1 def is paid from move (90 -> 89), not atk or prod. The
garrison floor change (1.05 -> 1.055) is well inside noise; Pass
3 stencil reach and Pass 1's kill formula are unaffected. No
strategy code change -- diff is one tech point.`,
  tech: { move: 89, stack: 0, prod: 2, atk: 5, def: 4 },
};
