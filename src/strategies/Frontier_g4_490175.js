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

// Hypothesis: the def-axis walk is still paying but with shrinking
// returns (Δ vs parent: +34, +28, +13). Parent's own rule says: if
// rating climbs we keep walking. It climbed, so take another 10-step
// — but this time pull from prod, not atk.
//
// Why prod and not atk:
//  - atk is already at 10. The parent comment flagged that the 1.4x
//    attacker bonus is what makes kills land; cutting atk to 0 would
//    silence tryKillAdjacent against any tile with non-trivial defense.
//  - Both sibling winners (g3_bd5683 at 40/20/40 and g3_ad3d81 at
//    40/20/30+stack10) pulled prod 50→40 and gained rating. That's two
//    independent data points that prod was over-allocated at 50.
//  - Keeping atk=10 preserves whatever marginal kill capability the
//    parent already validated, while the 10 freed from prod buys one
//    more tick on the def slope before it likely saturates.
//
// If rating drops, def=50 is past the knee and the next descendant
// should walk back to 40 and probe stack or move instead.
export default {
  name: "Frontier_g4_490175",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 10, def: 50 },
  description: "Frontier_g3 with 10 prod → def (now 0/0/40/10/50): keep walking def, pull from over-allocated prod instead of thin atk.",
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
