import Conqueror from "./Conqueror.js";

// Parent Conqueror_g5_e78ad3 dominated season #51 by shifting 10
// points out of {stack, def} into move (move 30 -> garrison 1.2,
// vs. neutral 1.3). Same act as Conqueror — kernel-ranked
// directions with target-aware commitment.
//
// The parent's thesis is "more reach per commitment compounds
// across the long sequence of small exchanges Conqueror plays."
// That thesis has a sibling that the parent did not test: the
// same kernel-driven cadence is *also* throttled by how fast
// armies regrow strength between commitments. On lab1 (growth
// 1.8, maxArmy 6) armies cap quickly, so every successful attack
// is followed by a regrow phase before the next commitment.
// Faster regrow = more cycles per match = more kernel scores
// landed = more territory taken.
//
// This descendant keeps the parent's move=30 (garrison 1.2 — the
// mobility advantage that worked) and atk=20 (preserves the
// enemy/1.4 + 0.6 math in Conqueror.act exactly — no risk of
// under-committing on a borderline kill). It moves 5 points from
// def into prod, lifting prod from 20 (neutral) to 25. The cost
// is def 15 -> 10, a small extra defensive penalty on top of the
// one the parent already accepted; acceptable for a strategy
// whose thesis is killing first, not surviving long.
//
// What this bot is *not*: a further mobility push. Going move=40
// or stack/def below 10 would compound the fragility the parent
// already chose. The hypothesis here is that prod and move are
// complementary axes — reach and recharge — and the parent only
// invested in one of them.
export default {
  name: "Conqueror_g6_b5f83a",
  author: "claude",
  version: 1,
  description: "Conqueror with mobility + prod (move 30, prod 25, atk baseline).",
  summary: `Same act as Conqueror — kernel-ranked direction selection
with target-aware commitment. Inherits parent's move=30 (garrison
1.2) and atk=20 (so Conqueror.act's enemy/1.4 + 0.6 math stays
exact and no borderline kill quietly under-commits).

The new bet is prod 20 -> 25, paid for by def 15 -> 10. Conqueror
plays a high-frequency rhythm: kernel-rank, commit, regrow,
commit again. On lab1 (24x18 wrap, growth 1.8, maxArmy 6) armies
cap fast and a slow regrow leaves cycles on the table. Faster
prod compounds with the parent's reach: same garrison floor,
more commitments per match.

The cost is def 10 (vs parent's 15) — a thin defensive layer for
a strategy whose thesis is killing first, not surviving long.
Mobility (move) and recharge (prod) are different axes; the
parent only invested in one, and this descendant tests whether
the other is also worth its 5 points.`,
  tech: { move: 30, stack: 15, prod: 25, atk: 20, def: 10 },
  act(army, game) {
    Conqueror.act(army, game);
  },
};
