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

// Hypothesis: keep walking the def axis one more step. Each +10 def
// step has paid: g0→g1 (+20), g1→g2 (+22), g2→g3 (+25). The slope is
// flat-or-rising, so we haven't hit diminishing returns yet — stop
// only when the season says stop. Take the last 10 from atk → def:
// atk 10→0, def 40→50.
//
// Why atk→0 should still be safe:
//  - Adjacent kills go through tryKillAdjacent, which applies the
//    1.4x ATTACKER_BONUS inflator — that's the dominant term, not the
//    atk tech multiplier at low values.
//  - The Spearhead path on FRONT tiles wins via stack momentum (rear
//    support pushing through), again not raw atk.
//  - Loss context (PressureSink, other Frontier variants) is all
//    sustained-attrition matchups; def 50 is exactly the lever that
//    blunts incoming pressure when those games stretch past tick 500.
//  - Sibling g3_ad3d81 took the stack route, so this descendant
//    keeps the def-walk pure: if it climbs, def is still alive at 50;
//    if it drops, we know def 40 was the local optimum.
export default {
  name: "Frontier_g4_39c6ff",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with another 10 atk → def: keep walking the def axis, slope hasn't flattened.",
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
