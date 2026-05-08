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

// Hypothesis: lineage atk→def walk is monotonically paying:
//   g0 50/0  → g1 30/20 (+20) → g2 20/30 (+18) → g3 10/40 (+25).
// Parent's own rule said keep walking while rating climbs; +25 means
// the def axis still has slope. Take the last 10 atk and put it in
// def: 0/50. This is the terminal step on this axis — if rating dips
// or flattens we have located the optimum at g3 (10/40) or here, and
// the next descendant pulls from prod instead.
//
// Why atk=0 should still be net positive vs. the loss context
// (PressureSink + Frontier-family beats):
//  - tryKillAdjacent applies a fixed 1.4x ATTACKER_BONUS independent
//    of atk tech, so the kill-or-stay decisions that matter most are
//    still inflated. The marginal kill that needed atk-tech to push
//    over the line is rare on this map.
//  - PressureSink wins by sustained border attrition; def is the
//    direct counter, and 40 may still be below the threshold where
//    its sink tiles stop being profitable.
//  - Sibling g3_bd5683 (40/20/40) also won by going further into def
//    via prod, confirming def hasn't saturated yet at 40.
export default {
  name: "Frontier_g4_2ee563",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with the last 10 atk → def: terminal step on the atk→def axis (0/50).",
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
