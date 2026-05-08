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

// Hypothesis: parent (g1) took the first def-axis step (atk 50→40,
// def 0→10) and gained +27 rating. Two cousins at atk 10 / def 40
// (g3_61b131, g3_eaf9b1) beat the parent in season #157, and a
// sibling lineage already proved the same axis pays through g2/g3
// (atk 30/def 20 → +215, atk 20/def 30 → +254). The parent's own
// rule was "if rating climbs we keep walking." It climbed, so take
// another step of the same size: atk 40→30, def 10→20.
//
// Why this should still pay against the loss context:
//  - 2/5 recent losses were to PressureSink, which farms sustained
//    border attrition; +10 def directly blunts the attrition rate.
//  - tryKillAdjacent's 1.4x ATTACKER_BONUS still applies, so most
//    kills the parent already wins still succeed at atk 30.
//  - Interior pump and Spearhead lean on prod/stack momentum, not
//    raw atk, so the 10-point shift barely touches the offensive
//    pipeline.
// If rating flats/drops here we know def 10 was the local sweet spot
// for *this* parent and the next descendant should try a different
// axis (move or stack are still frozen at 0).
export default {
  name: "Frontier_g2_95c28c",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 30, def: 20 },
  description: "Frontier_g1 with another 10 atk → def (now 50/30/20): keep walking the proven def axis.",
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
