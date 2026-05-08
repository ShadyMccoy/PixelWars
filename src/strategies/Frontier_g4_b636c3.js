import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent's tech is locked at atk 10 / def 40 — extremely
// defensive. With that profile, tile durability is high but the parent
// may be passing on adjacent kills it could actually win, because the
// 1.4x ATTACKER_BONUS used by tryKillAdjacent under-credits the
// (game-applied) attacker bonus relative to atk-10 raw damage. The
// recent losses are mostly to higher-atk Frontier cousins (g0 atk50,
// g1 atk40, g2 atk20) — those bots commit to more swings, which
// matters on a wrap 30x22 lab1 where border contact is constant.
// One small logic tweak: bump ATTACKER_BONUS 1.4 → 1.55 so the parent
// commits to slightly more marginal adjacent kills. Why this should
// pay specifically for THIS tech profile:
//  - def 40 means a failed kill leaves a stiff tile behind, so the
//    downside of an over-eager swing is small.
//  - atk 10 is low enough that without a more permissive bonus, the
//    kill predicate skips kills that the engine's actual attacker
//    bonus would still resolve in our favor.
//  - The interior pump and Spearhead routing are unchanged, so the
//    only behavioral shift is "swing more often on the front."
// If rating climbs, the bound was loose; if it drops, 1.4 was already
// at the edge and we're now eating bad trades.
const ATTACKER_BONUS = 1.55;

export default {
  name: "Frontier_g4_b636c3",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3_61b131 with ATTACKER_BONUS 1.4 → 1.55: lean into the def-heavy profile by committing to more marginal adjacent kills.",
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
