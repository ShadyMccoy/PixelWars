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

// Hypothesis: walk back the parent's terminal atk→def step.
// Lineage so far:
//   g0 atk 50/def  0 → 1294
//   g1 atk 30/def 20 → 1331 (+37)
//   g2 atk 20/def 30 → 1359 (+28)
//   g3 atk 10/def 40 → 1370 (+11)   ← local optimum
//   g4 atk  0/def 50 → 1190 (-180)  ← terminal step blew up
//
// The parent's *own* falsification rule was explicit: "If rating
// drops, atk 10 was the local optimum and we walk back." Rating did
// drop, hard. So walk back to atk 10 / def 40.
//
// Why atk=0 was likely fatal in a way the parent didn't predict:
//  - The parent argued tryKillAdjacent's hard-coded 1.4x bonus
//    dominates kills, so atk tech is "near-noise". Empirically false
//    at atk=0: in mirror matches against Frontier siblings whose own
//    def is climbing, the 1.4x inflator alone isn't enough to cross
//    the swap threshold without any atk multiplier behind it. The
//    losses in s208 are dominated by Frontier-family winners — these
//    are the matchups where our offense matters most.
//  - Diminishing returns on def: g2→g3 was only +11, less than half
//    the prior step. The 50th point of def is paying very little; the
//    10th point of atk pays a lot more by reopening the kill path.
//
// This descendant equals g3's tech vector. If it recovers toward
// 1370+, the next branch should pivot to a fresh axis (stack or move,
// both still unexplored on this chain — sibling Frontier_g2_cadf18
// already showed stack is live earlier in the lineage). If it
// stays low, something other than tech regressed and we look at the
// act() path.
export default {
  name: "Frontier_g5_9cee1f",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Walk back the failed atk 10→0 step: restore g3's tech (atk 10/def 40) from g4's atk 0/def 50 collapse.",
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
