import Parent from "./Frontier_g1_0c6381.js";

// Hypothesis: parent moved atk → def successfully (g0→g1: +31). The
// chain has since explored prod → def (g3_bd5683) and atk → def
// (g3_8c5891), so the def axis is well-probed. But stack is still
// frozen at 0 across the whole lineage — wholly unexplored.
//
// The painter pattern is a stack-heavy strategy by construction:
// every INTERIOR army's act() is a friendly army.attack(next, power)
// that pumps strength one step closer to the front. That's the
// hot path for most armies on most ticks. Stack tech multiplies
// that transfer, so a small bump should make the supply chain pump
// more strength per tick — feeding bigger Spearhead bursts and
// fattening the kill-or-stay bonus on the front.
//
// Pull 10 from prod (still 40, matches vanilla Frontier's effective
// pump) rather than from atk (preserve the 1.4x kill bonus that
// already cleared PressureSink-style attackers in winning matches)
// or from def (g1's gain came from def, don't undo it). If stack
// helps, the next descendant can push it further; if it flatlines,
// stack is confirmed dead-weight for painters and the lineage moves
// on to move (the only remaining frozen axis).
export default {
  ...Parent,
  name: "Frontier_g2_02c70c",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 30, def: 20 },
  description: "Frontier_g1 with 10 prod → stack: probe the unexplored stack axis on a strategy whose hot path is friendly stacking.",
};
