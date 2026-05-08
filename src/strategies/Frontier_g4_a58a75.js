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

// Hypothesis: the atk→def walk has paid every step on this lineage:
// g0 atk 50/def  0 → 1403
// g1 atk 30/def 20 → 1413 (+10)
// g2 atk 20/def 30 → 1430 (+17)
// g3 atk 10/def 40 → 1467 (+37, accelerating)
// Parent's own decision rule was "if it climbed, walk again." It
// climbed harder than the previous step, so take one more step of
// the same size: atk 10→0, def 40→50.
//
// Why this can still pay against the loss context (PressureSink in
// s155, mirror-Frontier variants elsewhere):
//  - tryKillAdjacent and Spearhead lean on ATTACKER_BONUS=1.4 and on
//    stack momentum/attackPower, not raw atk tech. The 30→20 and
//    20→10 atk drops did not visibly cost us kills — the rating kept
//    climbing — so atk 10→0 should likewise be near-noise on offense.
//  - def at 50 is the maximum on this axis; against PressureSink's
//    sustained border attrition, every extra def point eats more of
//    its sink output before it converts to a flip. This is the
//    cleanest place to find out if the def-only build has a ceiling
//    or not.
//  - This is the terminal step on the atk→def axis. If rating climbs
//    again, the whole axis was net positive end-to-end and the next
//    descendant should pivot to a fresh axis (stack/move). If rating
//    drops, atk 10 was the local optimum and we walk back.
export default {
  name: "Frontier_g4_a58a75",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3_eaf9b1 with another 10 atk → def: terminal step on the atk→def axis.",
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
