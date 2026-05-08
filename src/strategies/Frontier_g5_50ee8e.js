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

// Hypothesis: parent's atk=0 was the cliff. Three winning siblings
// (a9b303, 490175 at 0/0/40/10/50; 0e5bae less reliably) all restored
// atk back to 10 and pulled from prod, beating the parent. That's
// strong evidence that:
//   - atk=10 is the floor where tryKillAdjacent + 1.4x bonus still
//     reliably converts kills (parent comment was wrong about atk=0
//     being safe).
//   - prod=50 was over-allocated; prod=40 keeps the supply pump fed
//     by paintFrontier without wasting points past the knee.
//
// Take the winning-sibling config (0/0/40/10/50) as the new baseline,
// then probe the stack axis — unexplored on this build, and a known
// signal (sibling g3_ad3d81 reportedly gained on stack). Trade 10
// from def, not prod, because:
//   - prod=40 is the proven floor; cutting it further risks starving
//     the painter again.
//   - g3_eaf9b1's 0/0/50/10/40 hit rating 1370 (best in family), so
//     def=40 has prior evidence of being a viable level.
//   - stack=10 boosts Spearhead's stack-momentum push, which is the
//     attack vector that already carries our offense regardless of
//     atk multiplier.
//
// Net: 0/10/40/10/40. If this beats the winning siblings, stack is
// alive and the next descendant probes stack=20. If it underperforms
// 0/0/40/10/50, def=50 was load-bearing and we walk back.
export default {
  name: "Frontier_g5_50ee8e",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Sibling-winner baseline (atk restored to 10) + stack=10 from def: probe unexplored stack axis on a proven base.",
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
