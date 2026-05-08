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

// Hypothesis: parent (g3) walked atk 20→10, def 30→40 and got +46.
// Def axis is still paying. Next step in the same direction would be
// atk 10→0, def 40→50 — but atk:0 kills the 1.4x attacker bonus that
// drives tryKillAdjacent and the Spearhead front role (parent lost
// twice in s167 to other Frontier siblings whose attacks got through;
// going atk:0 risks our own kills failing where 10 atk would have
// landed). Instead, mirror sibling bd5683's playbook one tier up:
// pull 10 prod → def. New tech: prod 40, atk 10, def 50.
//   - PressureSink win in s167 was sustained border attrition; def 50
//     widens the survival margin further and is still the cheapest
//     answer to a sink.
//   - Prod 40 still matches vanilla Frontier baseline (g2_461435 ran
//     prod:40 successfully), so the supply pump shouldn't collapse.
//   - Keeping atk:10 preserves the 1.4x kill bonus path against
//     low-garrison adjacent tiles, which the Spearhead front role
//     leans on.
// If rating climbs, def is still under-shot and we pull more prod.
// If it drops, we know def 40 was the local optimum.
export default {
  name: "Frontier_g4_0542d0",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 10, def: 50 },
  description: "Frontier_g3_eaf9b1 with 10 prod → def (now 40/10/50): keep climbing def, preserve atk:10 for kill bonus.",
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
