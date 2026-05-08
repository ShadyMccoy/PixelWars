import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

const ATTACKER_BONUS = 1.4;

// Hypothesis: parent (50/30/20 prod/atk/def) dominated its season with
// no recorded losses after introducing def. The +50 rating jump from
// adding 20 def suggests harder borders are paying off and we haven't
// hit diminishing returns yet. Atk's marginal value is still capped by
// the 1.4x attacker bonus on tryKillAdjacent — kills that succeed at
// atk=30 likely also succeed at atk=20. Shift another 10 atk → def
// (now 50/20/30) to keep pushing on the axis that's working. If this
// over-shoots, the season will show def saturating; if it keeps
// climbing, the next descendant can pull from prod next.
export default {
  name: "Frontier_g2_cebd38",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 20, def: 30 },
  description: "Frontier_g1 with another 10 atk → def (now 50/20/30): keep climbing the def axis that paid off last gen.",
  act(army, game) {
    if (tryKillAdjacent(army, ATTACKER_BONUS)) return;

    const tile = army.tile;
    if (!tile) return;
    const map = game.map;
    const idx = tile.pos.y * map.width + tile.pos.x;
    const plan = paintFrontier(game, army.player);
    const role = plan.roles[idx];

    if (role === ROLE_FRONT) {
      Spearhead.act(army, game);
      return;
    }
    if (role === ROLE_INTERIOR) {
      const next = lowestDepthFriendlyNeighbor(army, plan);
      if (next) {
        const power = army.attackPower;
        if (power > 0.5) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
