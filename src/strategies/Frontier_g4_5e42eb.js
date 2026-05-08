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

// Hypothesis: the def-axis walk is showing diminishing returns
// (+28, +24, +19) and parent already lost to Frontier_g1_24609d
// (50/0 + stack:10) and Frontier_g1_ed1ff5 in recent seasons.
// Sibling g1_24609d's 10-prod → stack probe was already validated as
// a winner against this very parent, but it did so on the atk:50/def:0
// branch — stack has never been combined with our def:40 build.
//
// lab1 has maxArmy:12, a tight ceiling, so the painter's interior
// pumps likely lose output to clipping before strength reaches the
// front. Take 10 from prod (50→40, still the dominant axis and what
// vanilla Frontier uses) and put it on stack:10. Keep atk:10/def:40
// to preserve the def gains the lineage just paid for.
//
// Expected outcome:
//  - Against Frontier_g2_461435 (the recurring spoiler): our def:40
//    still softens its atk:50 Spearhead swaps; raising stack lets
//    our interior waves arrive at the front with more punch instead
//    of being capped at maxArmy along the way.
//  - Against PressureSink: stack:10 doesn't hurt the attrition bleed
//    that def:40 provides, so the floor here should hold.
//  - If rating moves up, stack is the next axis to push; if it drops,
//    we revert to pure def-axis exploration knowing stack and def:40
//    don't compose.
export default {
  name: "Frontier_g4_5e42eb",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Frontier_g3 with 10 prod → stack: combine the def:40 build with sibling g1_24609d's validated stack probe.",
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
