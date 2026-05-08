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

// Hypothesis: parent's atk 10→0, def 40→50 step lost -176 rating
// (1370 → 1194). The accelerating-slope read on the def-axis was
// wrong; somewhere between atk=10 and atk=0 the bot collapses. Two
// known-good neighbors bracket the parent: g3_eaf9b1 at (10/40)
// scored 1370, and sibling g4_0542d0 at (10/50, prod 40) beat the
// parent. The unexplored midpoint is *partial* atk: keep some kill
// multiplier alive without surrendering all the def gain.
//
// Single change: pull 5 def → atk. New tech (50/5/45). This tests
// the gradient at half-step granularity:
//  - If rating recovers most of the -176, the failure was atk:0
//    specifically (kill power collapse on the Spearhead/front path,
//    not the ATTACKER_BONUS additive but the army.attackPower the
//    bonus multiplies), and the def-axis walk is still alive.
//  - If rating stays low, def 45+ itself is the breakpoint and the
//    next descendant should walk def back to 40.
//  - Against the parent's loss context (sustained-attrition vs
//    PressureSink-style siblings), def 45 is still ~max territory
//    while atk 5 keeps interior-clear and front-push kills landing.
export default {
  name: "Frontier_g5_d8f209",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 5, def: 45 },
  description: "Frontier_g4_0585a4 with 5 def → atk: half-step atk restoration to bracket the (10/40) vs (0/50) gradient.",
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
