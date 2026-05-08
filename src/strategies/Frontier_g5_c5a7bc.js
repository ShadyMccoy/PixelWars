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

// Hypothesis: parent (atk 0 / def 50) cratered -172 vs g3, so def 50
// is past the knee. The two siblings that beat parent both kept def
// at 40 OR rebought atk back to 10, so the def-axis walk is done.
// But the `move` column has been frozen at 0 the entire lineage —
// the spawn brief explicitly flags frozen columns as "unexplored,
// not ruled out".
//
// Single-step move from parent: pull 10 def → move. New tech is
// { move:10, stack:0, prod:50, atk:0, def:40 }. We keep parent's
// atk:0 bet on purpose — this is the test of whether a garrison
// floor (move tech) can substitute for the capture-stickiness that
// atk normally provides:
//  - atk:0 means our kills are gated almost entirely by the 1.4x
//    ATTACKER_BONUS. Captures land but with thin margins, and the
//    parent's losses (especially seed=75 finishing #6 in a 6-Frontier
//    mirror) suggest captured tiles are flipping back.
//  - move tech raises the garrison floor, which is exactly the lever
//    that makes thin captures sticky. It's defensive but on a
//    different axis than def's output multiplier.
//  - def 50→40 is the known-good g3 setting; we're paying for the
//    move probe out of the most-likely-saturated knob.
//
// Against the loss context (mirror-Frontier #2/#4 finishes, lost to
// PressureSink-style attrition), a higher garrison floor directly
// blunts attrition tick-by-tick on tiles we already own.
//
// If rating climbs, move is a live axis and the next descendant
// pushes it further. If it drops, the 0-atk bet was the dominant
// problem and the next descendant must rebuy atk.
export default {
  name: "Frontier_g5_c5a7bc",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 50, atk: 0, def: 40 },
  description: "Probe the frozen move axis: 10 def → 10 move on top of parent's atk:0 bet, testing whether garrison floor substitutes for capture stickiness.",
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
