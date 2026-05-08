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

// Hypothesis: parent (g3_eaf9b1, def 40) and sibling g3_ad3d81 (stack
// 10) both beat their predecessors. The parent's gain came from def;
// the sibling's gain came from probing the frozen stack axis. Compose
// them: keep def 40 (the winning floor), then shift 10 prod → stack to
// add supply-chain momentum on top.
//
// Why this should help vs the loss context (placed #2/#3 to other
// Frontier variants and PressureSink in long games):
//  - Long games are exactly where stack compounds: INTERIOR pumps fat
//    pulses through the supply chain, FRONT armies stay above the 0.5
//    power floor between ticks, so Spearhead gets to swing more often.
//  - prod 50 → 40 is the cheapest donor: prod's slope flattens past the
//    midpoint, and the Frontier supply chain bottleneck against
//    PressureSink-style attrition is per-tile cap, not raw output.
//  - We're not touching atk 10: kills already lean on the 1.4x
//    ATTACKER_BONUS, and dropping atk further risks Spearhead whiffing.
//  - If rating climbs, the stack+def combo is alive; if it drops, we
//    learn that prod 50 was load-bearing under the def-40 regime
//    specifically (sibling lost prod from a def-30 base, different
//    context).
export default {
  name: "Frontier_g4_b88518",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Frontier_g3_eaf9b1 with 10 prod → stack: stack on top of the def-40 base.",
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
