import Frontier from "./Frontier.js";

// Hypothesis: parent dominated with prod:50/atk:50, def:0 unexplored.
// In the painter pattern only FRONT tiles fight, and they also absorb
// every incoming attack from enemies. With growth 1.8 / maxArmy 12 the
// front saturates quickly so extra prod has diminishing returns, while
// each lost frontier swap is expensive (it cracks the supply chain
// open). Shift 10 points prod -> def so front tiles survive
// counter-attacks more often without giving up the attacker bonus.
export default {
  ...Frontier,
  name: "Frontier_g1_68f73e",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 50, def: 10 },
};
