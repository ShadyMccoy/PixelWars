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

// Hypothesis: parent (atk 30 / def 20) was a +25 step from g0 along the
// def axis. Cousin Frontier_g3_eaf9b1 walked that same axis two more
// steps to atk 10 / def 40 and beat the parent in season #181. The
// proven progression is "10 atk → def per generation," and the parent
// has only taken one such step. Take exactly one more: atk 30→20,
// def 20→30. Why this should keep paying:
//  - 4/5 recent losses were against bots that out-attrited Frontier
//    (PressureSink, other higher-def Frontiers); +10 def directly
//    blunts incoming border damage, which is where Frontier's roles
//    get chewed up.
//  - tryKillAdjacent inflates by 1.4x, and the interior pump leans on
//    prod/stack rather than atk, so dropping atk 30→20 should barely
//    change which adjacent kills succeed.
//  - Matches the cousin's step size, so if rating climbs we keep
//    walking; if it drops we know def 20 was the local optimum on
//    *this* branch and the cousin's gains came from somewhere else.
export default {
  name: "Frontier_g2_de0710",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 20, def: 30 },
  description: "Frontier g2: 10 atk → 10 def, walking the proven def axis one more step.",
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
