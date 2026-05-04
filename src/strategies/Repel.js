import { balanceAttack } from "./helpers.js";

const GRADIENT = [-2, 2, -2, 3];

export default {
  name: "Repel",
  author: "core",
  version: 1,
  description: "Like SlowAndSteady, but biases movement away from the home corner.",
  summary: `SlowAndSteady's problem on corner spawns is that "weakest neighbor"
often points back into our own dense interior, so we cannibalize friendly
stacks instead of expanding. Repel injects a fixed gradient (push east and
south, pull away from west and north) so ties break outward. The number
3 on south is deliberately a bit larger than 2 on east — the home corner
in the standard maps sits NW, so south and east are the two productive
directions but south has more open ground before contact.`,
  act(army) {
    const tile = army.weakestAdjacent(GRADIENT);
    if (!tile) return;
    balanceAttack(army, tile);
  },
};
