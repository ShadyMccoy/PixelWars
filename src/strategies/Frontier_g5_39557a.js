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

// Hypothesis: parent (def:50/atk:0) cratered to 1161 from g3's 1370 —
// a -209 cliff that strongly suggests we walked past the def-axis
// corner. g3's atk:10/def:40 is the proven peak. So step ONE thing:
// reallocate 10 points from def back to the unexplored STACK axis.
// New tech: stack:10, prod:50, atk:0, def:40.
//
// Why this should help:
//  - Walking def 50→40 returns us to the rating-validated corner;
//    the marginal extra durability at def:50 was clearly not worth
//    whatever it cost (likely tempo/output) given the cliff.
//  - Stack is the only frozen axis in the entire lineage. Every
//    ancestor sat at stack:0, so we have zero data on whether it
//    pays. The siblings that beat the parent all stayed on the
//    prod/atk/def trio — pulling into stack is the information-
//    bearing move no one else is making.
//  - Stack amplifies the value of accumulated garrison strength,
//    which is exactly what the Spearhead front role consumes when
//    it bursts into a contested tile. The burst-attack path should
//    benefit more than a steady prod pump from a small stack boost.
//  - Loss context: parent got out-pushed by other Frontiers in long
//    games. A bigger garrison ceiling per tile (via stack) means
//    rear interior support builds more punch before flowing forward,
//    which is the direct counter to long-range attrition siblings.
//  - Keeping atk:0 isolates the change: if rating climbs, stack is
//    alive and future descendants can push it further; if it drops
//    back near parent, def:40 wasn't the only issue and atk:0 is
//    also load-bearing. Either result is a clean signal.
export default {
  name: "Frontier_g5_39557a",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 0, def: 40 },
  description: "Frontier_g4_e4fec1 with 10 def → stack: walk def back to the g3 corner and probe the frozen stack axis.",
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
