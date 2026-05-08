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

// Hypothesis: parent's "monotonic def-axis walk" thesis was wrong.
// Lineage gains were +37, +28, +11 — clearly DECELERATING, not flat
// with positive deltas. Crossing zero into atk:0 broke something
// (rating fell -157 from g3's 1371 to g4's 1214). The simplest read
// is g3 (atk:10, def:40) was the local peak, and atk:0 is past the
// edge — likely because Spearhead front pushes still need *some*
// atk multiplier to convert pressure into territory, even though
// tryKillAdjacent's kill check is gated by the fixed ATTACKER_BONUS.
//
// Two motivated moves combined into one descendant:
//   1. Roll back the failed step: atk 0→10, def 50→40. Restore the
//      known peak. The -157 is too loud a signal to ignore.
//   2. Pull 10 prod → stack on top of the rollback. Cousin
//      Frontier_g3_9c2544 (stack:10, prod:40, atk:20, def:30) is one
//      of the bots that beat this parent — stack feeds Spearhead's
//      front pushes by lifting the per-tile cap, and it's the one
//      axis the lineage has never moved. With prod:50 already past
//      the lab1 maxArmy:12 cap's marginal-return wall, 10 prod is the
//      cheapest 10 points to spend.
//
// Loss-context fit: parent's #2/#3 losses (PressureSink, Frontier_g2,
// other Frontier g4 cousins) all win by sustained midgame border
// pressure. Restoring atk:10 keeps Spearhead converting; def:40 still
// blunts inbound attrition; stack:10 lets front tiles pool deeper
// before spilling, so pushes hit harder when they go.
//
// Read on next iteration:
//  - climbs back near g3 (≥1360): rollback was correct; explore stack
//    further next gen
//  - climbs ABOVE g3: stack probe is paying — lean into it
//  - stays low: stack:10 wasn't enough to compensate for whatever else
//    is wrong; revert stack and try move/atk axes
export default {
  name: "Frontier_g5_ee21bc",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Roll back to g3 peak (atk:10 def:40) and probe the frozen stack axis (prod 50→40, stack 0→10) like cousin g3_9c2544.",
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
