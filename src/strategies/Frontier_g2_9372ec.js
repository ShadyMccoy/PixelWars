import Frontier_g1_0c6381 from "./Frontier_g1_0c6381.js";

// Hypothesis: parent's 20 atk → 20 def shift earned +32 rating over
// vanilla Frontier, validating that this lineage was atk-overshot. The
// sibling line (vanilla → g2_461435 → g3_8c5891) independently found
// def-building helps, with def:15 still climbing. Recent parent losses
// still feature attrition vs Frontier_g2_461435 and PressureSink-style
// pressure — both punish thin borders.
//
// Take one more small notch in the same proven direction: shift 5 more
// atk → def. atk:25 still triggers the 1.4x attacker bonus on every
// kill-or-stay, so kills that were succeeding still succeed; meanwhile
// borders harden a bit further to survive the swap math when we're the
// defender. Keep prod at 50 — the supply pump is the engine of the
// painter pattern and dropping it would starve the front. If rating
// moves up, def is still underinvested in this branch; if down, parent
// was the local optimum on this axis.
export default {
  ...Frontier_g1_0c6381,
  name: "Frontier_g2_9372ec",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 25, def: 25 },
  description: "Frontier_g1_0c6381 with 5 more atk → def (atk:25 def:25): one more notch on the proven def axis.",
};
