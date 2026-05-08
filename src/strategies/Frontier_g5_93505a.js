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

// Hypothesis: the def-axis walk has rolled over. Lineage gains were
// already decelerating (g1 +37, g2 +28, g3 +11) and parent's terminal
// step (atk 10→0, def 40→50) crashed -170. The peak was g3 at
// 10/40 atk/def, not g4 at 0/50.
//
// Two of the three explicit "winners over parent" (0585a4, 109513)
// have the exact same tech as parent — that's pure variance, not a
// signal. The one that actually differs is bfd073, which opened the
// completely unexplored stack axis (10 stack, kept def 20). Stack is
// still the only knob this lineage has never touched.
//
// Smallest informative move: walk back ONE step on def (50→40, the
// proven peak) and put the freed 10 into stack. This:
//   - Recovers the def-40 anchor that worked at g3.
//   - Tests stack, the unexplored axis, with a 10-point step.
//   - Keeps atk:0 — parent's argument that tryKillAdjacent's 1.4x
//     ATTACKER_BONUS carries adjacent kills regardless of atk tech
//     was reasonable; the -170 drop was about def overshoot, not atk
//     starvation.
//   - Stack directly multiplies survivors of the interior pump
//     (lowestDepthFriendlyNeighbor → friendly attack chain) — every
//     hop on lab1's 30×22 wrap map compounds, so stack is mechanically
//     well-aligned with how this bot already plays.
// If rating recovers toward g3 levels, def-40 was the floor we needed
// and stack is at worst neutral. If it climbs above g3, stack is a
// real edge worth pushing further next gen.
export default {
  name: "Frontier_g5_93505a",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 0, def: 40 },
  description: "Walk back from g4's def-50 overshoot to def-40, redirect the 10 points into the unexplored stack axis.",
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
