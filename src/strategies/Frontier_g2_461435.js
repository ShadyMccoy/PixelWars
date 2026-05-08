import Frontier from "./Frontier.js";

// Hypothesis: parent's atk:60 lost 195 rating vs vanilla 50/50 Frontier.
// The marginal atk past 50 didn't compound the 1.4x attacker bonus
// enough to crack PressureSink's braced high-pressure tiles, and it
// gave up the prod parity needed to keep up with Frontier's supply
// pump (lost to vanilla Frontier 4 of 5 recent losses). Sibling
// g1_68f73e already showed def:10 helps front survival. Pull the over-
// invested 10 atk back and spend it on def: keep prod at 40, restore
// atk to vanilla 50, add def:10. Expect this to survive Frontier's
// Spearhead pushes longer (def softens the swap math when we're
// defending) and bleed PressureSink's brace tiles instead of trying to
// out-atk them.
export default {
  ...Frontier,
  name: "Frontier_g2_461435",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 50, def: 10 },
};
