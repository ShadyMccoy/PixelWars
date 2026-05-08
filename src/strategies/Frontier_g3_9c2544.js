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

// Hypothesis: parent (g2) and its cousins are walking the atk↔def
// axis (g3_eaf9b1 went further to def:40; g3_8c5891 backed off toward
// atk:45). Both move and stack have stayed at 0 throughout the
// lineage — frozen columns, not ruled out. Take one small step on
// the unexplored stack axis: pull 10 from prod → stack while keeping
// the parent's atk:20 / def:30 split that earned the +26.
//
// Why stack is the next thing worth probing:
//  - The ROLE_FRONT path delegates to Spearhead, which thrives on
//    consolidated stacks punching through borders. stack lifts the
//    per-tile cap so frontline tiles can pool more before being
//    forced to spill — directly amplifying that path.
//  - 4/5 recent losses were to other Frontier descendants that
//    out-pushed us in the midgame (Frontier_g3_eaf9b1, _g3_8c5891,
//    _g3_bd5683 all winning). Same painter, same atk/def: the
//    differentiator is throughput. Stack is the cheapest knob that
//    feeds Spearhead without giving up the def shield.
//  - Cost is 10 prod (40 instead of 50). With growth 1.8 on lab1 and
//    maxArmy 12, prod's marginal return is already crowded against
//    the cap; trading a small slice for stack should net out.
// If rating climbs, stack is under-invested and we walk further.
// If it drops, prod was load-bearing and the axis stays frozen.
export default {
  name: "Frontier_g3_9c2544",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 20, def: 30 },
  description: "Frontier_g2 with 10 prod → stack: probe the frozen stack axis to feed Spearhead pushes.",
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
