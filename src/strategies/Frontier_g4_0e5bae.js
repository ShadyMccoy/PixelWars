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

// Hypothesis: lineage rule from the parent was "if rating climbs we
// keep walking the def axis; if it drops, walk back." The atk→def walk
// has been monotonically positive: g0→g1 +17, g1→g2 +18, g2→g3 +31.
// The size of the jump is even *increasing*, so we keep going one more
// step of the same size: atk 10→0, def 40→50.
//
// Why this should still pay against the loss context:
//  - The parent's own argument that going under-atk barely matters
//    still holds: tryKillAdjacent uses the hard-coded 1.4x ATTACKER_BONUS
//    to decide kills, and Spearhead's push leans on stack momentum and
//    raw army strength rather than the atk multiplier. atk=0 just
//    removes the small remaining tech multiplier, which never carried
//    the offense in the first place.
//  - Three of the recent losses were to PressureSink/Frontier variants
//    that win sustained-pressure border swaps. def is the multiplier
//    that pays back exactly there — every additional point of def
//    means our front tiles outlast theirs by a tick or two longer,
//    which compounds because painter then resupplies them.
//  - prod stays at 50 (saturated, steep diminishing returns past mid)
//    so the supply pump that our painter+SlowAndSteady relies on is
//    untouched.
//
// Falsification: if rating drops here, def 40 was the local optimum
// and the next descendant should walk back / try the unexplored
// stack axis (cf. sibling g3_ad3d81 which gained on the stack axis).
export default {
  name: "Frontier_g4_0e5bae",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with another 10 atk → def: keep walking the monotonically-winning def axis.",
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
