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

// Hypothesis: parent's first step on the def axis (atk 50→40, def 0→10)
// already netted +28 rating, and three independent cousins that walked
// def even further all *beat* the parent: g3_ad3d81 (def 30), g3_eaf9b1
// (def 40), g3_8c5891 (def 15). Same step-size walk: atk 40→30, def
// 10→20. Why this should keep paying:
//  - The cousins' wins suggest the local optimum is past def 10, not
//    at it. A 10-point step lands us on the conservative side of two
//    confirmed-good points (def 30 and def 40).
//  - Loss context is dominated by other Frontier variants and
//    PressureSink farming border attrition — both are blunted by def,
//    not atk.
//  - tryKillAdjacent's 1.4x ATTACKER_BONUS still does the heavy
//    lifting on kill math at atk 30; the Spearhead/INTERIOR pump path
//    leans on prod (still 50) and stack, not atk.
// If rating climbs, the axis is still alive and we keep walking. If
// it drops, def 10 was the local plateau for this exact ancestry and
// the cousins' wins came from elsewhere in their lineages.
export default {
  name: "Frontier_g2_cd9f16",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 30, def: 20 },
  description: "Frontier_g1 with another 10 atk → def: keep walking the def axis the cousins rode to wins.",
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
