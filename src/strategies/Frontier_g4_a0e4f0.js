import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent's tech is now atk 10 / def 40 — our armies are
// defensive heavyweights with weak punch. The inherited 1.4x
// ATTACKER_BONUS was tuned for atk-heavy ancestors (atk 50→30→20),
// so at atk 10 it almost certainly green-lights marginal kill
// attempts that the engine then loses, donating our stack to the
// enemy and weakening the border. Drop ATTACKER_BONUS 1.4 → 1.25:
// only the attacks we're more confident about go through; the rest
// stay home and accrete on def-40 tiles where they're hardest to
// pry off. 4/5 recent losses were narrow #2 finishes against other
// Frontier variants — fewer wasted suicidal attacks should swing
// some of those mirror matches. Tech is inherited verbatim.
const ATTACKER_BONUS = 1.25;

export default {
  name: "Frontier_g4_a0e4f0",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3_61b131 with ATTACKER_BONUS 1.4→1.25: at atk 10, be more conservative on kill-or-stay.",
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
