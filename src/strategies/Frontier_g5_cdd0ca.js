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

// Hypothesis: g4 (atk=0, def=50) collapsed -225 vs g3 (atk=10, def=40),
// so atk=0 is a cliff, not the local optimum I'd hoped. The def-axis
// walk g1→g2→g3 (+37, +28, +11) was clearly decelerating; g4 confirmed
// it overshot. The cliff must lie somewhere in atk ∈ [0, 10].
//
// Bisect: atk=5, def=45. One step back from the cliff toward g3.
//   - If most of the -225 recovers, the cliff is sharp around atk=0
//     and the true optimum sits near atk=5–10. Next descendant fine-
//     tunes within that band or pivots to an unexplored axis (stack/move).
//   - If recovery is partial, the cliff is gentler and the optimum is
//     closer to g3's atk=10, def=40. Next descendant walks back further.
// Either outcome maps the slope between the last known peak and the
// failed endpoint, which is the cheapest information to acquire next.
export default {
  name: "Frontier_g5_cdd0ca",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 5, def: 45 },
  description: "Bisect the atk cliff between g3 (atk=10) and g4 (atk=0).",
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
