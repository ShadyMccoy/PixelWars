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

// Parent g4 jumped 1322 → 2325 (+1003) at atk 0 / def 50, completing
// the atk→def axis as net positive end-to-end. Per the parent's own
// note: "If rating climbs again, the whole axis was net positive
// end-to-end and the next descendant should pivot to a fresh axis
// (stack/move)."
//
// Pivoting to stack. Hypothesis: take 10 from prod (50→40) into
// stack (0→10). The strategy's offense rides on attackPower /
// stack momentum:
//  - tryKillAdjacent uses ATTACKER_BONUS * army.attackPower for kill
//    decisions; higher stack → more kills converted before the bonus
//    erodes.
//  - Spearhead pushes the front by stacking armies; stack tech
//    raises the cap on that momentum.
//  - prod 50 is generous; shaving 10 off should barely dent the
//    economy on a 30×22 lab map where def 50 already fortifies
//    holdings against PressureSink-style attrition.
// One-knob test of the stack axis: if rating climbs, the next
// descendant takes another 10 prod→stack; if it drops, prod 50 was
// load-bearing and we revert.
export default {
  name: "Frontier_g5_cf09fe",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 0, def: 50 },
  description: "Frontier_g4_a58a75 pivot: 10 prod → stack to open the stack axis.",
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
