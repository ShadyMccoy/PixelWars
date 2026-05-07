import Conqueror from "./Conqueror.js";

// Pure tech-only descendant: same Conqueror kernel, but the tech
// budget is poured into prod/atk/def — the three knobs that
// directly multiply per-tile economic and combat output. Splits
// 100 points as evenly as integer math allows: prod=34, atk=33,
// def=33, with move and stack zeroed.
//
// Trade-off: move=0 means a garrison floor of 1.5 (vs 1.3 at the
// neutral 20-anchor and 0.6 at the move=90 used by recent
// descendants), so attackPower per tile is reduced. The bet is
// that prod=34/atk=33/def=33 gives a compounding advantage
// per-fight (atk ~1.3×, def ~2× vs sub-baseline) and per-tick
// (prod ~1.7× refill rate) that more than pays for the higher
// garrison commitment.
export default {
  ...Conqueror,
  name: "Conqueror_g10_ed740d",
  description: "Conqueror with prod/atk/def-maxed tech (0/0/34/33/33).",
  summary: `Same Conqueror kernel; tech rebalanced to 0/0/34/33/33 — every
remaining point spent on the three multiplier knobs. Sub-baseline move
(garrison 1.5) and stack (sub-1.0× max army) are the cost; the win
condition is that fights resolve in attacker's favor at ~1.3× atk and
~2× def, while territory regrows ~1.7× faster than neutral.`,
  tech: { move: 0, stack: 0, prod: 34, atk: 33, def: 33 },
};
