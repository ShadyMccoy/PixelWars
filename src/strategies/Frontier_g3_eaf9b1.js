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

// Hypothesis: parent (g2) shifted 10 atk → def (atk 30→20, def 20→30)
// and the rating jumped +254. Parent's own rule was "if rating climbs
// we keep walking; if it drops we stop." Rating climbed hard, so walk
// the def axis another step of the same size: atk 20→10, def 30→40.
//
// Why this should still be net positive against the loss context
// (placed #2 to PressureSink in s155):
//  - PressureSink wins by farming sustained border attrition; def is
//    exactly the multiplier that blunts that attrition, and 30 may
//    still be under the threshold where its sink tiles stop paying.
//  - Offensive output is gated by ATTACKER_BONUS=1.4 and prod=50, not
//    really by atk: tryKillAdjacent uses the 1.4x inflator, and the
//    Spearhead path leans on stack momentum more than raw atk. The
//    20→10 drop should barely change which kills succeed.
//  - We're matching the previous step size (10), so if rating drops
//    we know def 30 was the local optimum and we walk back.
export default {
  name: "Frontier_g3_eaf9b1",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g2 with another 10 atk → def: keep walking the def axis after the +254 jump.",
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
