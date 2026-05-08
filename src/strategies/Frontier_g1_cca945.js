import Frontier from "./Frontier.js";

// Hypothesis: parent dominated with prod:50/atk:50 and tech otherwise
// frozen. The painter pump funnels interior strength toward the front,
// but with stack:0 the front cap is the default — a small stack
// investment raises the headroom of front tiles, so the supply chain
// has somewhere to deposit strength instead of overflowing. Shift 10
// points prod -> stack and see if the pump pays off better.
export default {
  ...Frontier,
  name: "Frontier_g1_cca945",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 50, def: 0 },
};
