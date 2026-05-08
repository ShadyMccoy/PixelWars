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

// Hypothesis: parent overshot the def axis. The lineage Δ trail was
// +37, +28, +11, then -193 at g4 (atk 0 / def 50). The collapse is
// loud — def 50 / atk 0 stripped enough offensive bite that the bot
// can't finish kills, and the lone recorded loss is to a sibling at
// atk 20 / def 30 (MORE attack than us, not less). So def did bottom
// out, somewhere between g3's 40 and g4's 50.
//
// Take a half-step back instead of a full revert: atk 0 -> 5,
// def 50 -> 45. Why a half-step rather than reverting all the way to
// g3 (atk 10/def 40):
//  - g3 already exists in the field at rating 1370. Cloning its tech
//    teaches us nothing new; a half-step probes whether the true
//    optimum lives between g3 and g4 rather than at g3 exactly.
//  - tryKillAdjacent's 1.4x ATTACKER_BONUS means even a sliver of atk
//    (5) restores marginal kill thresholds that def-50/atk-0 missed,
//    while def 45 keeps most of the border-stickiness g4 was banking on.
//  - If rating recovers above g3 (1370), the optimum is interior to
//    [40,50]. If it lands between g4 and g3, def 40 is the real peak
//    and the next descendant snaps to g3's tech. Either result is a
//    cleaner signal than a full revert would give.
export default {
  name: "Frontier_g5_ad0136",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 5, def: 45 },
  description: "Frontier g5: half-step back from g4's def overshoot — atk 0->5, def 50->45.",
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
