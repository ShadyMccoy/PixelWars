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

// Hypothesis: parent's own rule is "rating climbed, keep walking the
// def axis." It climbed hard (+42 vs g2). The strict next step is
// def 40 → 50 — but the only knob with 10 to spare is either atk
// (already at 10) or prod. Dropping atk to 0 would gut attackPower
// in the Spearhead path, so pull from prod instead: prod 50 → 40.
//
// Two pieces of evidence say prod 50 is not load-bearing:
//  - The slope of prod past the midpoint is shallow (diminishing
//    returns); the lineage has had prod pinned at 50 since g0, never
//    tested below.
//  - Sibling g3_ad3d81 (which beat the parent) already runs at
//    prod 40 with no apparent collapse — its rating gain came from
//    spending the freed 10 elsewhere.
//
// So this descendant continues the def-axis walk one more step while
// testing the cheapest source of points. Against the parent's loss
// context that is exactly what we want: def 50 should bleed
// PressureSink's brace tiles harder, and stiffen our front against
// the Frontier_g2_461435 swarm we lost to twice in season 168.
// If rating climbs, def 40 wasn't the optimum and prod 40 is fine.
// If rating drops, we know one of (def saturated, prod load-bearing)
// and step back to the parent next.
export default {
  name: "Frontier_g4_31f0e7",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 10, def: 50 },
  description: "Frontier_g3_eaf9b1 with 10 prod → def: keep walking the def axis past 40 by pulling from saturated prod.",
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
