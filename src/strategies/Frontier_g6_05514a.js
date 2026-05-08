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

// Hypothesis: parent (g5_8000dc) cleared the atk-cliff at atk:3 and
// jumped +305 vs g4. Per parent's own plan: "if rating recovers, we
// can keep pushing def in future descendants while only paying 3 atk
// for kill-margin safety." Rating recovered hard, so do exactly that:
// pull 5 prod → def, holding atk:3 fixed (don't re-test the cliff).
// New mix (0/0/45/3/52).
//
// Why prod → def and not stack → def or move → def:
//  - stack/move are still 0 in this lineage; touching them mixes two
//    variables and we can't attribute the rating delta. Hold them.
//  - Prod at 50 is past its steep zone; def's slope was still +11 at
//    g3 (per parent's note) and may not be exhausted. Trading a flat
//    region for a still-sloping one is the classic +EV move.
//  - Loss context: parent placed #2/#3 in long games (ticks 458–755)
//    against other Frontier variants. Long games favor the side whose
//    border attrition pays better — that's the def multiplier.
//
// Read of the result:
//  - Rating ↑ vs parent: def slope is still alive past 47; next
//    descendant can keep walking (def→57, prod→40).
//  - Rating ≈ parent: def has saturated near 50; pivot to the frozen
//    stack/move axes — sibling g3_ad3d81 already showed stack pays.
//  - Rating ↓: prod-50 was load-bearing for the supply chain that
//    feeds Spearhead at the front; revert and walk a different axis.
export default {
  name: "Frontier_g6_05514a",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 45, atk: 3, def: 52 },
  description: "Frontier_g5_8000dc with 5 prod → def (now 0/0/45/3/52): cliff cleared at atk:3, follow parent's plan to keep walking def.",
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
