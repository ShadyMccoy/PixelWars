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

// Hypothesis: parent g4 (0/0/50/0/50) crashed -216 from g3's 1370 — atk:0
// was a cliff (kills stop closing, Frontier-vs-Frontier loss list confirms).
// Sibling probes already cover the obvious recoveries:
//   - g5_705be5: half-step walk-back on atk (50/5/45)
//   - g4_0542d0: rollback + prod→def (40/10/50)
//   - g5_ee21bc: rollback + prod→stack (40,stack:10,10/40)
//
// What none of them touch: the MOVE axis, which has been frozen at 0 for
// the entire g0→g4 lineage. That's an unexplored knob, not a ruled-out
// one. Move tech raises the garrison floor (per docs/techs.md framing in
// the brief: "move = garrison floor"), which should help on lab1's small
// wrap map with maxArmy:12 — borders are dense, and a higher floor means
// front tiles stay occupable through Spearhead pushes and trade through
// PressureSink-style attrition without collapsing to 0.
//
// Smallest informative move: start from the known-peak g3 floor
// (0/0/50/10/40, rated 1370), and pull 10 prod → move. New tech:
// move:10, stack:0, prod:40, atk:10, def:40.
//   - Restores atk:10 to clear the kill-margin cliff that broke g4.
//   - Keeps def:40 at the proven g3 level (the +12 step that paid).
//   - Prod:40 is still proven (vanilla Frontier g2 ran prod:40); on lab1
//     with maxArmy:12, prod past ~40 hits diminishing returns at the cap.
//   - Move:10 is the cheapest probe of the only frozen axis.
//
// Read on next iteration:
//  - climbs at/above g3 (≥1370): move axis pays — push move:20 next.
//  - recovers but stays under g3: prod:40 hurt more than move:10 helped;
//    revert prod, keep probing move from a different funding source.
//  - stays low: move axis isn't paying on this map; pivot to stack or
//    atk fine-tuning instead.
export default {
  name: "Frontier_g5_f56ad5",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 40, atk: 10, def: 40 },
  description: "Roll back to g3 peak (atk:10 def:40) and probe the frozen move axis (prod 50→40, move 0→10).",
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
