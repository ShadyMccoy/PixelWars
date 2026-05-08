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

// Hypothesis: parent loses 5/5 recent matches to PressureSink variants
// on lab1. Frontier's tactics are sound (painter + supply chain), but
// its tech is 50/50 prod/atk with def=0 — every contested front tile
// is paper-thin. PressureSink wins the war of attrition because
// Frontier's borders flip easily under sustained pressure.
//
// We already get a 1.4x attacker multiplier on the kill-or-stay branch,
// so the marginal value of pure atk tech is low — kills that succeed
// would have succeeded anyway, and atk doesn't help us survive incoming
// hits. Reallocate 20 points from atk → def. Same painter, same
// per-army logic, just harder borders. The lineage tech chart shows def
// is wholly unexplored (frozen at 0), making this a high-information
// step regardless of which way it moves rating.
export default {
  name: "Frontier_g1_0c6381",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 30, def: 20 },
  description: "Frontier with 20 atk → 20 def: harder borders to survive PressureSink-style attrition.",
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
