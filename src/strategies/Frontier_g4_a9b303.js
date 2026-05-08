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

// Hypothesis: lineage table shows def is the only axis that's been
// monotonically rewarding (g0→g3: 0→20→30→40, ratings 1434→1425→1439→1476).
// Parent's own rule: "if rating climbs we keep walking." Parent climbed
// +37, so walk def one more step.
//
// This time pull from prod, not atk. Two reasons:
//  - atk is already at 10. Dropping further risks breaking the
//    tryKillAdjacent / Spearhead kill math; the 1.4x ATTACKER_BONUS
//    can paper over small atk shortfalls but atk=0 is a genuine
//    floor we shouldn't cross blindly.
//  - sibling g3_ad3d81 took 10 from prod and BEAT the parent. That's
//    direct evidence prod=50 is past its diminishing-returns knee in
//    this painter pattern, where the supply chain matters more than
//    raw production rate.
//
// So: prod 50→40, def 40→50, atk fixed at 10. If rating climbs,
// def-from-prod is alive and we walk again. If it drops, prod=50 was
// load-bearing for the supply chain and def=40 was the local def
// optimum — both useful signals.
export default {
  name: "Frontier_g4_a9b303",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 10, def: 50 },
  description: "Frontier_g3_eaf9b1 with 10 prod → def: keep walking def, but pull from prod instead of atk to preserve kill math.",
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
