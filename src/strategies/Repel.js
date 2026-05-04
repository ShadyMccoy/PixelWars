import { balanceAttack } from "./helpers.js";

const GRADIENT = [-2, 2, -2, 3];

export default {
  name: "Repel",
  author: "core",
  version: 1,
  description: "Like SlowAndSteady, but biases movement away from the home corner.",
  act(army) {
    const tile = army.weakestAdjacent(GRADIENT);
    if (!tile) return;
    balanceAttack(army, tile);
  },
};
