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

// Hypothesis: parallel branches g1/g2/g3 already walked the def axis
// (atk→def, then prod→def) and netted gains. The stack column is
// frozen at 0 across the whole lineage — unexplored, not ruled out.
// lab1 has maxArmy 12, a low cap, so the painter's interior pumps may
// be losing output to ceiling clipping before strength reaches the
// front. Probe stack with a small 10-point allocation taken from prod
// (still the dominant axis at 40). If stack raises effective carrying
// capacity, interior→front waves deliver more punch per pump and the
// kill bonus stays intact (atk untouched at 50). If rating moves, the
// next descendant can decide whether to push stack further or revert.
export default {
  name: "Frontier_g1_24609d",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 50, def: 0 },
  description: "Frontier with 10 prod → stack: probe the frozen stack axis, keep atk for kill bonus.",
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
