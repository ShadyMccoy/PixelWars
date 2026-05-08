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

// Hypothesis: bracket the atk-cliff between 0 and 5.
// The parent (0/0/50/0/50) crashed -177 from g3 (0/0/50/10/40). Sibling
// Frontier_g5_705be5 already showed that atk 0→5 (with def 50→45)
// recovers enough to beat the parent — so the cliff lives somewhere in
// the (0, 5] interval and 5 is on the safe side. The cheapest next
// experiment is the half-step: atk 0→3, def 50→47.
//
//  - If rating ≈ g5_705be5: cliff is below atk:3, so we can keep
//    pushing def in future descendants while only paying 3 atk for
//    kill-margin safety. Useful because def's marginal slope was still
//    +11 at g3 and may not be exhausted yet.
//  - If rating drops back toward parent: cliff is above atk:3 (i.e.
//    between 3 and 5) and def-50 is reachable only with atk≥5. Future
//    descendants should anchor at atk:5 and walk other axes (stack,
//    move) instead of scraping the last 2 atk points.
//
// Same architecture as parent — only the tech mix changes, so any
// rating delta is attributable to the kill-margin math, not behavior.
export default {
  name: "Frontier_g5_8000dc",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 3, def: 47 },
  description: "Frontier_g4 with atk 0→3, def 50→47: bracket the kill-margin cliff between atk:0 (parent crash) and atk:5 (sibling recovery).",
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
