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

// Hypothesis: parent crashed -177 going from g3 (50/10/40) to
// (50/0/50). The walk-too-far accelerated past the def optimum AND
// zeroed atk. But before retreating on def, probe the one frozen
// axis on this branch: stack. Cousin Frontier_g3_1d7ef8 already
// proved a stack=10 probe pays on lab1's maxArmy 12 cap (it beat the
// parent in season #220's loss list). The g3_1d7ef8 build kept def
// at 30; here we sit on top of the parent's def 50 commitment and
// only swap 10 prod -> stack.
//
// Why this is a single, defensible step from the parent:
//  - One axis change (prod 50 -> 40, stack 0 -> 10). atk stays 0,
//    def stays 50 — preserving the parent's bet so the experiment
//    isolates "does stack help on top of def 50".
//  - prod 40 is still the largest knob and matches Frontier_g4_340f64
//    (the season's winner over our parent), so production headroom
//    isn't the variable being tested.
//  - On lab1 (30x22 wrap, maxArmy 12) interior prod 50 likely clips
//    the ceiling — stack tech raises the ceiling Spearhead can ride,
//    converting wasted prod into front momentum.
//
// If rating climbs, stack compounds with def 50 and the next
// descendant pushes stack further. If it stalls/drops, the parent's
// problem was def 50 itself (saturation) and the sibling hill-climb
// should walk def back instead.
export default {
  name: "Frontier_g5_8aa39c",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 0, def: 50 },
  description: "Frontier_g4 with 10 prod -> stack: probe the frozen stack axis on top of the def-50 commitment.",
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
