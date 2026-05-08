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

// Hypothesis: lineage gains have been monotonic and accelerating along
// the atk→def axis (g1 +14, g2 +21, g3 +30 vs each prior parent). The
// parent's own rule was "rating climbed, take another step of size 10."
// But the next full step lands at atk:0, and zero on any axis is a
// known cliff risk in this engine — kill math, attackPower scaling,
// and tryKillAdjacent thresholds all touch atk in ways the parent's
// reasoning hand-waved past. Take a HALF step instead: atk 10→5,
// def 40→45. Why this should still pay:
//  - PressureSink (the s155 #2 finish) and other strong-border bots
//    are still the loss context; another +5 def keeps blunting border
//    attrition where def's multiplier compounds.
//  - Half-step is the cheapest probe of whether the def axis is
//    saturating — if rating still climbs, the trend extrapolates and
//    next gen can commit to atk:0; if it drops or flattens, we know
//    atk:5–10 is the floor without having driven all the way to zero.
//  - tryKillAdjacent at 1.4x bonus and Spearhead's stack-based push
//    should be near-identical at atk:5 vs atk:10 — the kill-or-stay
//    threshold barely shifts.
export default {
  name: "Frontier_g4_7586de",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 5, def: 45 },
  description: "Frontier_g3 with a half step atk 10→5, def 40→45: probe the def axis without risking the atk:0 cliff.",
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
