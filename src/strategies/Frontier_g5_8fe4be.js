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

// Hypothesis: parent (atk 0, def 50) crashed -178 vs g3 (atk 10, def 40).
// The def walk's marginal returns were already collapsing (+37, +28, +11)
// before going negative, so def 50 is past the local optimum. Of the bots
// that beat parent in season #218, the two with non-identical tech
// (g3_1d7ef8 and g2_749873) both run stack 10 — and g3_1d7ef8's notes
// argue stack pays specifically because lab1's maxArmy 12 cap clips
// interior prod-50 growth before it reaches the front.
//
// Take one step off the overshot def axis into the unexplored stack
// axis: def 50 → 40, stack 0 → 10. Keep atk 0 so the stack probe is
// isolated from any atk restoration — if rating climbs, stack is alive
// and the next descendant should keep walking it; if it doesn't, the
// loss was atk→0 (not def 50) and we should restore atk instead.
//
// Spearhead-driven FRONT pushes are exactly where stack burst pays:
// against Frontier-clones farming border attrition (PressureSink-style
// matchups parent kept finishing #2/#3 in), a stack-10 burst tips
// close pushes that prod alone can't because the cap eats the surplus.
export default {
  name: "Frontier_g5_8fe4be",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 0, def: 40 },
  description: "Frontier_g4 with def 50→40, stack 0→10: walk off the overshot def axis into the unexplored stack axis under lab1's maxArmy 12 cap.",
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
