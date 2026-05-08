import Frontier from "./Frontier.js";

// Hypothesis: sibling g1_68f73e already showed def:10 helps front
// survival. The other untouched dial in the prod/atk balance is atk
// itself. Frontier loses to PressureSink-style opponents that brace
// their high-pressure tiles; the only way through that brace is to
// actually win the swap. The 1.4x attacker bonus already does most
// of the work, but each extra atk point compounds with it on every
// front tile attack. With growth 1.8 / maxArmy 12 the front saturates
// fast, so prod past ~40 is wasted strength queued behind a capped
// front. Shift 10 prod -> atk to convert that wasted production into
// a higher conversion rate on the swaps that actually decide games.
export default {
  ...Frontier,
  name: "Frontier_g1_855294",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 60, def: 0 },
};
