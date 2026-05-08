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

// Hypothesis: g4's atk=0 cratered (-172). The "accelerating returns"
// read from g1→g2→g3 was wrong — there's a cliff between atk 10 and
// atk 0. Without any atk tech, tryKillAdjacent's 1.4x bonus alone
// can't finish neighbors, so border trades that used to clear stop
// clearing, and the def-50 wall just stalls instead of advancing.
//
// Binary-search the cliff: atk 5, def 45 — halfway between g3 (the
// peak) and g4 (the crater). If this lands near g3's 1370, the
// optimum sits in [5,10] atk and we'll refine downward next gen.
// If it craters too, the cliff is between atk 10 and atk 5, and the
// next descendant should walk back to atk 8 / def 42.
export default {
  name: "Frontier_g5_f07611",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 5, def: 45 },
  description: "Half-step back from g4's atk=0 crater toward g3's peak: atk 5, def 45.",
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
