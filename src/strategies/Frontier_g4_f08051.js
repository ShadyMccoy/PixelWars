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

// Hypothesis: walk the def axis one more step of the same size
// (atk 10→0, def 40→50). The lineage gradient is still climbing and
// even accelerating slightly: g0→g1 +20, g1→g2 +22, g2→g3 +25. We
// have no evidence the def slope has flattened yet, so the smallest
// hypothesis-driven step is to repeat what worked.
//
// Why dropping atk all the way to 0 should still be safe:
//  - tryKillAdjacent uses ATTACKER_BONUS=1.4 as its multiplier, not
//    the atk tech. Most successful kills came from the 1.4x inflator
//    plus stack momentum, not raw atk.
//  - Spearhead's push leans on accumulated strength via the supply
//    chain, which prod=50 still feeds at full rate.
//  - Sibling g3_ad3d81 already covers the stack axis; we don't want
//    to duplicate it. Sticking on def keeps this step a clean
//    one-axis probe so the rating delta is interpretable.
//  - vs PressureSink (the loss context's biggest threat): more def
//    is exactly what blunts its attrition farming. If def 40 was
//    already past the useful threshold we'll see a drop here and
//    know to walk back; that's the signal we're trying to extract.
export default {
  name: "Frontier_g4_f08051",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3_eaf9b1 with another 10 atk → def: gradient still climbing, take one more step on the same axis.",
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
