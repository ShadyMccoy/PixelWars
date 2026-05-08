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

// Hypothesis: parent (50/0/50/0/50) crashed -201 from g3 (50/10/40).
// Sibling g5_705be5 is testing the cliff with a half-step on the
// atk/def axis (atk 0→5, def 50→45). To get an independent read on
// a different axis, pull from prod instead of def: keep def at the
// terminus 50 but restore atk to the g3-known-good level of 10 by
// taking 10 from prod (50→40).
//
// Why prod is the right donor:
//  - lab1 has growth 1.8 and maxArmy 12. With prod:50 the per-tick
//    output is already crowded against the army cap; the marginal
//    return on the last 10 prod is the most likely point of
//    diminishing returns in the lineage. None of the lineage has
//    ever moved prod off 50, so this column is genuinely unexplored
//    rather than tested-and-rejected.
//  - Restoring atk:10 puts the kill-margin math back to where the
//    g3 lineage was winning (g3 rating 1369 vs g4's 1168). If the
//    -201 was caused by atk:0 breaking tryKillAdjacent's effective
//    output (the 1.4x multiplies a weaker base when atk is empty),
//    this should recover most of it while still keeping def:50.
//  - This pairs cleanly with g5_705be5's atk:5/def:45 read:
//      * If both g5_705be5 (+) and this (+) climb, atk≥5 is the
//        floor and we can keep def near 50.
//      * If this climbs but g5_705be5 stalls, prod was the slack
//        and atk:10 is the real threshold.
//      * If this stalls but g5_705be5 climbs, prod:50 was load-
//        bearing and we should not pull from it.
//      * If both stall, def:50 itself is the wall — next descendant
//        walks back to def:40 outright.
export default {
  name: "Frontier_g5_af5648",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 10, def: 50 },
  description: "Frontier_g4 with 10 prod → atk: keep def at terminus, restore g3-level atk by pulling from saturated prod.",
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
