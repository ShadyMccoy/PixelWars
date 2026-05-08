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

// Hypothesis: parent (g2) has walked the def axis 0→20→30 with steady
// gains (+5, +14). The lineage table shows `move` is wholly frozen at
// 0 across every ancestor — it's the highest-information unexplored
// axis. Sibling g3_ad3d81 already cracked prod→stack (won), and
// sibling g3_eaf9b1 is pushing def→40 further, so duplicating either
// is wasted oxygen.
//
// Take 10 from prod → move. Why move, why now:
//  - prod 50 is at the saturating end of its slope; trimming to 40
//    cost g3_ad3d81 nothing measurable (it still beat us).
//  - The painter pumps INTERIOR strength toward FRONT via
//    lowestDepthFriendlyNeighbor — that's an explicit supply chain.
//    `move` raises the garrison floor, so when an INTERIOR army
//    pumps forward, the source tile retains more residual strength
//    rather than draining empty. That should keep the chain churning
//    in long games (3/5 recent losses ran 500+ ticks against
//    PressureSink and other Frontier variants — exactly the games
//    where compounding floor matters).
//  - atk 20 + 1.4x bonus is still doing the kill-or-stay work; not
//    touching it.
//
// If rating climbs, move is alive and we keep walking. If it drops,
// the move axis was frozen for a reason and the chain doesn't need
// the floor we paid prod for.
export default {
  name: "Frontier_g3_ead23b",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 40, atk: 20, def: 30 },
  description: "Frontier_g2 with 10 prod → move: probe the wholly-frozen move axis to raise the supply-chain garrison floor.",
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
