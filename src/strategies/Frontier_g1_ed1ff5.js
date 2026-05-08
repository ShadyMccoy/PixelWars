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

// Hypothesis: parent runs atk 50 / def 0 — the def axis is completely
// unexplored, and two independent Frontier descendants that landed at
// atk 10 / def 40 both beat the parent in season #157 (g3_61b131 won
// twice, g3_eaf9b1 won twice). Take the first small step on that
// proven axis: atk 50→40, def 0→10. Why this should pay:
//  - tryKillAdjacent uses the 1.4x ATTACKER_BONUS, so most adjacent
//    kills the parent already wins still succeed at atk 40.
//  - The interior pump path leans on stack/prod, not atk.
//  - 4/5 recent losses were to bots with stronger borders; +10 def
//    blunts incoming attrition (especially against PressureSink,
//    which farms sustained border damage).
// If the rating climbs we know to keep walking; if it drops, def 0
// was actually load-bearing here in a way the cousins' lineage maps
// don't capture.
export default {
  name: "Frontier_g1_ed1ff5",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 40, def: 10 },
  description: "Frontier with first step atk 50→40, def 0→10: open the def axis that two cousins rode to wins.",
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
