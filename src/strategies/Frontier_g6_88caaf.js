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

// Hypothesis: parent (g5, 50/5/45) only recovered +42 of g4's -205
// crash. That's a partial bounce, not a full one — which the parent's
// own comment flagged as the "def:50 itself was overshot" branch:
// walk further back toward the known-good g3 floor at 50/10/40 (1369).
// Take a half-step: atk 5→8, def 45→42. This brackets between g5
// (5/45 → 1206) and g3 (10/40 → 1369) without exactly reproducing g3.
//   - If rating lands near g3's 1369, the def axis really did
//     overshoot at 45+ and the lineage's optimum sits around 40-42.
//     Next descendant locks in def:40 and explores prod/stack.
//   - If rating lands near g5's 1206, the kill-margin gain from
//     atk is sub-linear in this 5-10 range and the loss vs g3 is
//     coming from somewhere else (meta shift, noise, or a hidden
//     interaction). Next descendant tries reproducing g3 exactly
//     to separate signal from noise.
//   - If rating overshoots g3, def in the 40-45 band has a non-
//     monotonic dip and we'd want to sweep it more finely.
export default {
  name: "Frontier_g6_88caaf",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 8, def: 42 },
  description: "Frontier_g5 with another 3 def → atk (50/8/42): bracket between g5 and the known-good g3 floor.",
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
