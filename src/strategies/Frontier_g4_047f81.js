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

// Hypothesis: parent (g3) walked def 30→40 and gained +41 rating; g2
// before that walked def 20→30 for +16. The def axis is still paying,
// each step a bit better than the last. Take one more step of the same
// size: atk 10→0, def 40→50, prod stays at 50.
//
// Why this should still help against the loss context:
//  - Recent losses are split between Frontier-family bots (Spearhead
//    swap math when defending) and Conqueror/Frontier_g2_461435
//    (sustained border pressure). def directly softens the swap math
//    for the defender, which is exactly when we're losing tiles.
//  - The kill path uses ATTACKER_BONUS=1.4 in tryKillAdjacent and
//    Spearhead leans on stack momentum; raw atk is the least leveraged
//    axis here. Dropping atk 10→0 should change very few kill
//    outcomes — the 1.4x inflator already dominates the swap math on
//    the offensive side.
//  - This matches the previous step size (10) so the rating signal
//    is comparable: if it climbs again, def is still under-shot; if
//    it drops, g3's def:40 was the local optimum and we walk back.
export default {
  name: "Frontier_g4_047f81",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with another 10 atk → def step: defense axis kept paying, take one more notch.",
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
