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

// Hypothesis: g1 → g2 (atk 30→20, def 20→30) jumped +254 rating, so
// the def axis is clearly underexplored and the previous step was on
// the right side of the optimum. Take another 10 from atk → def
// (atk 20→10, def 30→40) to keep walking. The 1.4x ATTACKER_BONUS
// still inflates kill-or-stay outcomes — most adjacent kills the
// parent already wins should still succeed at atk 10 — while def 40
// further stiffens border tiles against PressureSink's sustained
// attrition (the only bot that beat the parent in season #155). If
// the rating climbs again we keep going; if it drops, we've found
// the corner where atk shortfall starts costing more kills than def
// gains saves tiles.
export default {
  name: "Frontier_g3_61b131",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g2 with another 10 atk → def: continue walking the def axis after a +254 jump.",
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
