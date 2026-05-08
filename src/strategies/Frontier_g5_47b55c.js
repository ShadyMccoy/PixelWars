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

// Hypothesis: parent crashed -175 going atk 10→0 with def 40→50, so
// def=50/atk=0 is over-extended. But sibling Frontier_g4_a9b303
// (prod 40, atk 10, def 50) BEAT the parent, which already covers
// "restore atk by pulling from prod". The unexplored move on this
// branch is the still-frozen stack axis.
//
// Why stack: with atk=0, Spearhead is the only real offensive engine
// (tryKillAdjacent's 1.4x bonus only papers over small shortfalls).
// Spearhead's value comes from stack momentum specifically — it
// snowballs by piling armies onto a salient. Stack tech has been 0
// across the entire lineage (g0..g4); we have no read on whether
// it's worth anything.
//
// Pull 10 from def (50→40, the proven-good g3 level) and put it
// into stack (0→10). This is a single-axis re-allocation that:
//  - walks def back to its g3 value, undoing the part of the parent
//    that we know hurt (def=50 only worked when atk stayed at 10),
//  - probes whether the frozen stack axis is worth anything for the
//    first time, while keeping atk=0 so we get a clean read
//    (atk-vs-stack would confound).
//
// If rating climbs back near g3 or higher, stack is alive and the
// next descendant pushes further. If rating only partly recovers,
// the def 50→40 walk-back was doing the work, not stack. If it
// crashes again, stack is dead in this build and we know to focus
// future moves on def/prod re-allocation.
export default {
  name: "Frontier_g5_47b55c",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 0, def: 40 },
  description: "Frontier_g4_c9d674 with def 50→40 and stack 0→10: walk def back to its g3 value and probe the still-frozen stack axis for Spearhead momentum.",
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
