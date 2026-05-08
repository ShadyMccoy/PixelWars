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

// Hypothesis: parent went atk 10 -> 0 / def 40 -> 50 and collapsed
// (-171). The lineage Δ was actually decelerating (+37, +28, +11),
// not accelerating — atk:0 was a step too far and the offense
// thinned out. But sibling Frontier_g2_cadf18 showed that prod -> stack
// is a live axis in this archetype (it beat us in seed=87).
//
// Keep the def:50 commitment (the deepest unique probe of this gen)
// and try to rescue the atk:0 offense by feeding the front in fatter
// chunks: prod 50 -> 40, stack 0 -> 10. Why this should help where
// raw atk would not:
//  - Spearhead's value is stack momentum; thicker INTERIOR pulses
//    arriving at FRONT keep army.attackPower above the 0.5 threshold
//    more often, so more pushes actually fire.
//  - tryKillAdjacent's kill math is governed by the fixed 1.4x
//    ATTACKER_BONUS, not the atk knob — so we recover offense via
//    consolidation rather than per-tile attack multiplier.
//  - Prod 40 is still well above the production floor and matches
//    g2_cadf18, which proved this prod level is sustainable.
//
// If this rates above the parent (1199) but below g3 (1370), stack
// partially offsets the atk:0 cliff. If it lands above g3, def:50 is
// viable once stack supports it. If it stays at parent levels, the
// problem is atk:0 itself and the next descendant should walk atk
// back from 0 -> 10.
export default {
  name: "Frontier_g5_ac4732",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 0, def: 50 },
  description: "Frontier_g4 with 10 prod -> stack: probe whether stack momentum can rescue the atk:0 offense while keeping def:50.",
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
