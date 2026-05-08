import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: tech is locked at atk 10 / def 40 — a defensive profile
// that wins by attrition, not by initiating trades. The inherited
// ATTACKER_BONUS=1.4 scales our power in tryKillAdjacent's
// "should I attack this neighbor" decision, so it gates how marginal
// a kill we'll attempt. With atk only 10, our raw attacker power is
// weak; the 1.4 inflator likely greenlights borderline trades that
// our low atk doesn't actually finish cleanly, leaking stack on the
// border instead of letting def 40 absorb and farm.
//
// The parent's losses are 5/5 close #2 finishes (ticks 375–712) to
// other Frontier variants — exactly the regime where saving a few
// border armies per matchup tips the order. Tighten the kill filter
// to 1.25: still aggressive enough to take obviously-winning kills,
// but skips the marginal ones the def-heavy build shouldn't be
// initiating. If rating climbs, the def profile wants a more
// conservative trigger and we'll explore further down. If it drops,
// 1.4 was load-bearing for converting favorable adjacencies and we
// stop walking this axis.
const ATTACKER_BONUS = 1.25;

export default {
  name: "Frontier_g6_9d691d",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g5 with ATTACKER_BONUS 1.4 → 1.25: defensive tech profile shouldn't initiate marginal kills.",
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
