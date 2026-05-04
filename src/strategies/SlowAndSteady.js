import { balanceAttack } from "./helpers.js";

export default {
  name: "SlowAndSteady",
  author: "core",
  version: 1,
  description: "Always splits toward the weakest neighbor with a balanced attack.",
  summary: `The baseline. Every tick, send the minimum force needed to take or
reinforce the weakest adjacent tile, and keep the rest behind. The thesis is
that controlled, low-variance pressure beats burst aggression in the long
run: balanceAttack rarely overcommits, so we don't strand a fat army
adjacent to a tile we can't quite hold. Most of the other core bots use
SlowAndSteady as a fallback because in the absence of a better idea it is
hard to do worse.`,
  act(army) {
    const tile = army.weakestAdjacent();
    if (!tile) return;
    balanceAttack(army, tile);
  },
};
