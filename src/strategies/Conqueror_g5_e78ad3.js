import Conqueror from "./Conqueror.js";

// Parent Conqueror_g4_868391 wraps Conqueror.act in a 4-neighbor
// "stall detector" pre-check plus a 5x5 fallback for the stalled
// case. Walking the logic carefully, that fallback is dead code:
// it only ever runs when every adjacent tile is either a too-strong
// enemy or a full-cap friendly, and tryCommit refuses both
// (needed > sLimit for the unbeatable enemy; room <= 0.5 for the
// full friendly). Conqueror.act already iterates kernel-ranked
// directions and falls through blocked ones internally, so the
// wrapper is a no-op gate around an equivalent loop. Removing it
// is behavior-preserving simplification.
//
// The actual experiment here is the tech loadout. Parent runs the
// neutral {20,20,20,20,20} in tournaments, so the season-#44
// dominance came from strategy alone. This descendant shifts 10
// points out of {stack, def} into move, dropping the garrison
// floor from 1.3 to 1.15 — every army gets ~0.15 more attack
// power per commitment, and on a 24x18 wrap map that compounds
// across the long sequence of small exchanges Conqueror plays.
// atk and prod stay at the neutral baseline 20 so Conqueror.act's
// `enemy / 1.4 + 0.6` beatability math remains exact: no risk of
// under-committing on a borderline kill, which would be the way
// a tech tweak could quietly regress a winning strategy.
export default {
  name: "Conqueror_g5_e78ad3",
  author: "claude",
  version: 1,
  description: "Conqueror with mobility-leaning tech (move 30, atk/prod baseline).",
  summary: `Same act as Conqueror — kernel-ranked direction selection
with target-aware commitment. The change is purely tech: shift 10
points from {stack, def} into move, holding {atk, prod} at the
neutral 20 baseline so Conqueror.act's enemy/1.4 + 0.6 math stays
exact and no borderline kill quietly under-commits.

Garrison floor goes 1.3 -> 1.15, so each army carries ~0.15 more
attack power on every commitment. On lab1 (24x18 wrap, growth 1.8,
maxArmy 6) the bot cycles many small offensives per match, and
that extra reach compounds across engagements. The cost is a
small stack cap and small def penalty — acceptable for a strategy
whose thesis is killing first, not surviving long.

Parent's hasAdjacentTarget wrapper plus 5x5 fallback are dropped
because they form a no-op gate around Conqueror.act: the fallback
can never commit (tryCommit refuses both unbeatable-enemy and
full-friendly targets), and the pre-check just decides whether to
call into a loop that already handles blocked directions itself.`,
  tech: { move: 30, stack: 15, prod: 20, atk: 20, def: 15 },
  act(army, game) {
    Conqueror.act(army, game);
  },
};
