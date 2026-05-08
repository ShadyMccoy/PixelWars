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

// Hypothesis: parent (g3) walked def 30→40 and gained only +1, so the
// def axis has flattened on this base — atk 10 / def 40 looks like a
// local optimum. Cousin g6_4cad37 already validated that pulling 10
// from prod onto a fresh axis (stack) pays off on this exact base,
// which means prod 50 was over-allocated, not load-bearing.
//
// Take the smallest disciplined next step on the *other* unexplored
// axis: 10 prod → move. Move is the garrison floor, and it's been 0
// for the entire lineage — so we genuinely don't know what it's worth
// here. Why it might pay on this base specifically:
//  - Painter INTERIOR tiles pump strength forward via
//    lowestDepthFriendlyNeighbor; a garrison floor keeps each tile
//    above the 0.5 power threshold longer between pulses, which
//    smooths the supply chain rather than making it bursty.
//  - 4/5 recent losses were long games (409–591 ticks); a higher
//    garrison floor compounds vs. similarly-teched rivals because
//    it reduces wasted "below-threshold" turns where the army
//    contributes nothing.
//  - Holds the confirmed atk 10 / def 40 border so we're testing one
//    variable, not two — if rating climbs, move is alive on this
//    base; if it drops, prod 50 was load-bearing in a way that the
//    g6 stack-shift didn't expose, and the next cousin can re-bias.
export default {
  name: "Frontier_g4_a433b8",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 40, atk: 10, def: 40 },
  description: "Frontier_g3 with 10 prod → move: open the unexplored move axis on top of the confirmed atk10/def40 base.",
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
