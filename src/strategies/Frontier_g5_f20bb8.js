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

// Hypothesis: parent (g4, 0/0/50/0/50) crashed -207 from g3 because
// atk:0 broke the kill margin in Frontier-vs-Frontier matchups (the
// loss list is dominated by g4/g2 Frontier clones). Sibling g5_705be5
// already proved a half walk-back (atk 0→5, def 50→45) recovers the
// cliff. Take an orthogonal probe instead of duplicating it: keep
// def:50 (the lineage's strongest signal) and pay for restored atk:10
// out of prod, not def.
//
// Tech: 0/0/40/10/50.
//   - Restores the proven g3 kill margin (atk:10 closed kills with
//     the 1.4x ATTACKER_BONUS inflator) so tryKillAdjacent stops
//     stalling against Frontier siblings.
//   - Keeps def:50 — that's the parent's only retained "win" and we
//     don't want to give it back blindly; sibling g5_705be5 tests
//     trimming def, so we hold it constant here.
//   - Shaves 10 from prod (50→40), the truly unexplored axis: prod
//     has been frozen at 50 across g0-g4. If shaving prod is cheap
//     because the painter / supply chain already saturates the cap,
//     the rating climbs and the next descendant pulls more from prod.
//   - Three-way contrast with siblings makes the season interpretable:
//       g5_705be5  50/5/45   pays for atk from def (cheap def assumed)
//       this one   40/10/50  pays for atk from prod (cheap prod assumed)
//     Whichever climbs more tells us which axis was actually overshot.
export default {
  name: "Frontier_g5_f20bb8",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 10, def: 50 },
  description: "Frontier_g4 with prod 50→40 → atk 0→10: restore the proven g3 kill margin while keeping def:50, paying from the long-frozen prod axis.",
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
