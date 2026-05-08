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

// Hypothesis: parent confirmed atk 10 / def 40 is the local optimum
// on the atk↔def axis (g5 1380 reproduced g3's 1358 mix and beat the
// def-50 overshoot by +233). The parent's own comment explicitly
// queued up the next direction: "looking at a different knob (stack
// or prod) on a future descendant." Cousin g3_ad3d81 already took
// 10 prod → stack (on the g2 atk20/def30 base) and beat the parent
// — so stack > 0 has independent evidence of paying off.
//
// Smallest disciplined step: keep the confirmed atk 10 / def 40
// border mix and take 10 from prod → stack. Why this should help:
//  - prod 50 is at its saturation knee; the marginal output per
//    point is smallest there.
//  - the painter thesis is that INTERIOR tiles pump strength to
//    FRONT via supply chain; a higher stack ceiling lets those
//    pulses arrive fatter and lets FRONT armies stay above the
//    0.5 power floor longer between ticks.
//  - 4/5 recent losses were long games (396–531 ticks) where
//    bigger working stacks compound vs. similarly-teched rivals.
// If rating climbs, stack is alive on the def-40 base too. If it
// drops, prod 50 was load-bearing and we'll bias future steps to
// preserve it.
export default {
  name: "Frontier_g6_4cad37",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Frontier_g5 with 10 prod → stack: open the unexplored stack axis on top of the confirmed atk10/def40 base.",
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
