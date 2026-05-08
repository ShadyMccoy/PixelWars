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

// Hypothesis: parent (g2) walked def by trading from atk (20→30 def
// at the cost of atk 30→20) and netted +41 — clearly the def axis
// is still paying. The obvious next step is atk 20→10, def 30→40,
// but the g2 parent's own note flags that sibling g3_eaf9b1 is
// already walking that exact path. Picking the same fork would just
// duplicate work.
//
// Instead, walk def from a *different source*: pull 10 prod → def,
// holding atk fixed at 20. New mix: 0/0/40/20/40.
//
// Why prod is the right donor here:
//  - Sibling g3_ad3d81 (which beat the parent) explicitly argued
//    "prod is already saturated at 50 (steep diminishing returns
//    past the midpoint)" — and that bot won. Treat prod-50 as flat.
//  - atk 20 is the validated floor with 1.4x ATTACKER_BONUS for
//    kill-or-stay margins; don't disturb a knob the parent already
//    proved out.
//  - move/stack are frozen at 0 in this branch; changing them mixes
//    variables. Stay on the def axis until it stops paying.
//
// Read of the result:
//  - Rating ↑: def slope is still alive at 40 even when sourced
//    from prod, confirming prod-50 was the slack.
//  - Rating ≈: prod-50 was partly load-bearing for the painter's
//    supply chain; revert and let the atk→def cousin own this run.
//  - Rating ↓: the supply chain genuinely needs prod-50; future
//    descendants should source def from atk, not prod.
export default {
  name: "Frontier_g3_e2e665",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 20, def: 40 },
  description: "Frontier_g2 with 10 prod → def (0/0/40/20/40): walk the proven def axis from prod, since sibling g3_eaf9b1 already owns the atk→def fork.",
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
