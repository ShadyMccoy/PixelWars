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

// Hypothesis: isolate the stack-axis probe from the atk-restoration.
// Cousin Frontier_g5_ee21bc beat the parent with two simultaneous
// changes vs g3: rolled back atk (0→10 from def) AND probed stack
// (0→10 from prod). We can't tell which change carried it. Cousin
// Frontier_g4_235131 also beat the parent and only restored atk
// (0→10 from prod), which suggests atk-restoration is sufficient
// — but it doesn't rule out that stack alone would have done it too.
//
// This descendant holds atk:0 fixed (deliberately keeping the parent's
// broken edge) and pulls 10 from prod into stack. If it climbs near
// g5_ee21bc, stack was load-bearing and we should keep pushing it.
// If it stays in parent territory (~1198), atk-restoration was the
// dominant lever in the cousins' wins and we should commit there.
//
// Why stack might pay even with broken atk:
//  - Spearhead's front pushes scale with attackPower; stack lifts the
//    per-tile cap so border tiles pool deeper before spilling, so
//    each push lands harder.
//  - PressureSink (parent's recurring nemesis) wins by sustained
//    border attrition; deeper pools at front tiles let our def:50
//    soaks coexist with bigger periodic pushes outward, instead of
//    leaking via attackPower drips.
//  - Prod is past the lab1 maxArmy:12 cap's marginal-return wall, so
//    10 prod → stack is the cheapest 10 points to spend.
//
// If this loses, we have a clean read: atk:0 is the dominant issue
// regardless of stack. Next gen pulls atk back from prod and explores
// the truly untouched move axis.
export default {
  name: "Frontier_g5_61ab47",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 0, def: 50 },
  description: "Parent + 10 prod → stack, atk held at 0: isolates the stack-axis effect from cousins' atk-restoration.",
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
