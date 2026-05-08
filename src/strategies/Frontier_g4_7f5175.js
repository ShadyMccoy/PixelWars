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

// Hypothesis: the atk→def walk has produced a monotonic climb of
// nearly identical step sizes (+21, +24, +27) across g1/g2/g3 with
// no sign of curving over. Take one more step of the same size:
// atk 10→0, def 40→50. This is the terminal point of that axis, so
// if rating climbs we've found the ceiling and next gen must pivot;
// if it drops we know def 40 was the local optimum and we walk back.
//
// Why atk:0 should be tolerable here:
//  - tryKillAdjacent still applies the hardcoded 1.4x ATTACKER_BONUS,
//    which is the dominant kill-math multiplier. The atk tech slope
//    on top of that has been small enough that g3 already cut atk
//    20→10 with a +27 gain — the marginal kills lost weren't paying.
//  - Spearhead's pushes lean on stack momentum + prod throughput
//    more than raw atk multiplier; prod stays at 50.
//  - Against PressureSink-style attrition (the recurring loss
//    context — placed behind PressureSink in s369), the maximum
//    border-survival multiplier is exactly what blunts sustained
//    pressure. def:50 is the largest value we can place here.
export default {
  name: "Frontier_g4_7f5175",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with last 10 atk → def: terminal step of the atk→def walk to find the ceiling.",
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
