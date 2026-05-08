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

// Hypothesis: sibling g3_69a9ba opened the frozen stack axis by
// pulling 10 from prod (50→40) and won (+24 to parent). That mixes
// two changes: less prod AND new stack. To isolate stack as the
// driver — and because vanilla Frontier (prod 50) and the parent
// (prod 50) both succeeded at full prod — try opening stack by
// sacrificing more atk instead of touching prod. Specifically, take
// another 10 from atk (20→10) into stack (0→10), keep prod 50 and
// def 30 intact.
//
// Why this should help without breaking what works:
//  - Atk has been over-budgeted in this chain: g0→g1→g2 cut atk
//    50→30→20 for +48 total rating, so the marginal atk point is
//    cheap. The 1.4x ATTACKER_BONUS inside tryKillAdjacent already
//    inflates kill-or-stay outcomes, so atk 20→10 should rarely
//    flip a kill that g2 was making.
//  - Prod stays at 50, so the SlowAndSteady interior pump matches
//    vanilla Frontier's tempo — we don't slow down the supply chain
//    that feeds the painter's BFS reinforcement.
//  - Stack 0→10 gives Spearhead noticeably stronger crashes on
//    FRONT tiles, the same lever that helped g3_69a9ba beat the
//    parent in close Frontier-vs-Frontier games.
//
// If rating climbs near +24 (matching g3_69a9ba), stack is the real
// driver and prod-50 is also fine — strong signal to push stack
// further. If it climbs much less than g3_69a9ba's +24, the prod
// drop in that variant was doing real work and atk-sacrifice is the
// wrong funding source. If it drops, atk 10 is past the cliff for
// this map and the kill checks are starting to fail.
export default {
  name: "Frontier_g3_d3143e",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 10, def: 30 },
  description: "Frontier_g2 with atk 20→10, stack 0→10: open the stack axis without sacrificing prod, isolating stack as the driver vs g3_69a9ba's prod-funded variant.",
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
