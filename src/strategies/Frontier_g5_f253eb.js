import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis (logic-only mutation; tech inherited verbatim from parent):
// Parent locked in ATTACKER_BONUS 1.4 → 1.6. Tech axis is exhausted
// (slope flat across g1–g4) and the bonus knob just got moved. The
// next untouched lever is the INTERIOR power floor — currently 0.5,
// gating whether an inland army even bothers stepping toward the
// lowest-depth friendly neighbor. g6_7f7121's roadmap explicitly
// flagged this as the next probe ("raise the 0.5 power floor on
// INTERIOR delegation, or tighten the role split").
//
// Parent's recent losses include two fast crushes (#5 in 503t vs
// 66af38's def 50 wall, #4 in 802t vs b7d338) and three close #2/#3
// finishes. The fast crushes suggest interior armies are dribbling
// forward at low power and getting absorbed against stiff borders
// instead of pooling into a deliverable stack. A 0.5 floor lets a
// nearly-empty tile still step inward; raising it makes those
// micro-moves wait one extra tick of prod before committing, which
// should produce thicker consolidation waves and bigger handoffs to
// the FRONT role.
//
// Single knob: 0.5 → 0.75 (conservative half-step, not 1.0). If
// rating climbs, the floor was under-tuned and future descendants
// can keep pushing it. If it drops, 0.5 was load-bearing for
// throughput and we revert; next probe should be the role split or
// the ATTACKER_BONUS direction.
const ATTACKER_BONUS = 1.6;
const INTERIOR_POWER_FLOOR = 0.75;

export default {
  name: "Frontier_g5_f253eb",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g4_b918a6 with INTERIOR power floor 0.5 → 0.75: thicker inland consolidation waves vs stiff-defense crushes.",
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
        if (power > INTERIOR_POWER_FLOOR) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
