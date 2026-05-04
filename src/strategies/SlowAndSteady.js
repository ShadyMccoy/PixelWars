import { balanceAttack } from "./helpers.js";

export default {
  name: "SlowAndSteady",
  author: "core",
  version: 1,
  description: "Always splits toward the weakest neighbor with a balanced attack.",
  act(army) {
    const tile = army.weakestAdjacent();
    if (!tile) return;
    balanceAttack(army, tile);
  },
};
