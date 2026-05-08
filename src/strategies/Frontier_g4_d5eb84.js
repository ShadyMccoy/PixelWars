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

// Hypothesis: parent's def-axis hill-climb is showing diminishing
// returns (+32, +26, +16). At def 40 the marginal blunt-attrition
// payoff is shrinking, and pushing further (atk 10→0) risks
// breaking tryKillAdjacent kills on hardened borders.
//
// Sibling g3_ad3d81 validated the unexplored `stack` axis from a
// different position (took 10 prod → stack and beat the parent).
// Apply the same one-knob move from THIS lineage's def-heavy base:
// keep atk 10 / def 40, take 10 from prod → stack.
//
// Why this should compound here specifically:
//  - Recent losses 2/3/4 were to other Frontier variants that won
//    long supply-chain games (ticks 487–624). Those are exactly the
//    games where a fatter per-tile stack ceiling lets INTERIOR pulses
//    deliver more force to FRONT before Spearhead consumes it.
//  - prod 50 is at the saturated end; cousin lineage already showed
//    prod 40 + stack 10 is at least neutral, plausibly positive.
//  - We keep the def 40 attrition bulwark that earned the +16, so
//    we're not undoing the parent's win — just adding a second
//    dimension of pressure.
// If rating climbs we know stack is alive on top of def 40;
// if it drops, prod 50 was load-bearing in this branch.
export default {
  name: "Frontier_g4_d5eb84",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Frontier_g3 with 10 prod → stack: open the stack axis on top of the def-40 base.",
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
