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
const INTERIOR_PUMP_MIN = 1.5;

// Hypothesis: parent's interior pump fires whenever power > 0.5, which
// with prod=50 means interior tiles trickle single-army packets forward
// every tick. Recent losses (#272 ticks=519, #261 ticks=699) ground out
// late, suggesting the front never gets a decisive wave — it gets a
// drip feed that the engine absorbs as attrition. Three of five losses
// went to cousins running atk 30–40 / def 10–20 (more aggressive),
// which probably arrive at contested borders in fatter clumps.
//
// One-knob change: raise the interior threshold from 0.5 → 1.5. Same
// painter, same roles, same tech — interior tiles now accumulate a
// small pile before flowing toward lowest-depth, producing thicker
// waves at the front. tryKillAdjacent still fires unchanged, so we
// don't give up any local kill opportunities; we just stop bleeding
// supply on dribbles that can't break a defended border tile.
export default {
  name: "Frontier_g6_1c19b6",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Raise interior pump threshold 0.5 → 1.5 so supply waves arrive thicker.",
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
        if (power > INTERIOR_PUMP_MIN) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
