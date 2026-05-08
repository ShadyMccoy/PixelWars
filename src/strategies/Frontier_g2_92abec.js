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

// Hypothesis: parent g1 already validated the def axis (+34 rating from
// 0→20 def). The two descendants that have beaten the parent both moved
// away from prod=50: g3_8c5891 dropped prod to 40, g4_e7abc2 dropped it
// to 30. So prod=50 looks like the next over-allocated knob. But stack
// (g4) is already being explored elsewhere in the tree — the truly
// untouched axis in this whole lineage is `move` (frozen at 0 from g0
// through every winning descendant).
//
// Move = garrison floor. A nonzero floor means front tiles keep a
// baseline defender even after Spearhead launches an attack out of
// them, which directly addresses the same attrition story that
// motivated g1's def push: PressureSink-style opponents win when our
// borders go paper-thin between ticks. def helps when a hit lands;
// move helps the tile not be empty in the first place. Take 10 from
// prod (still 40, which g3 showed is plenty) → move. Tiny step into
// a wholly unexplored axis — if rating moves either way it's a
// high-information sample.
export default {
  name: "Frontier_g2_92abec",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 40, atk: 30, def: 20 },
  description: "Frontier_g1 with 10 prod → 10 move: probe the unexplored move axis to keep front-tile garrison floors above zero between Spearhead launches.",
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
