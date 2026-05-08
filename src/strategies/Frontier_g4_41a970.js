import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: ATTACKER_BONUS=1.4 was set when atk was 30–50; the lineage
// has since walked atk all the way down to 10 while leaving the bonus
// constant. With atk=10 our raw attack power is much smaller, so the
// 1.4x heuristic is now over-optimistic — tryKillAdjacent will commit
// armies into "kills" that don't actually finish the defender, leaving
// the survivor weakened on a frontier where def 40 was supposed to
// keep us sticky. Tighten the bonus to 1.2 so we only commit to kills
// we're confident we can land. Expected wins:
//  - Fewer wasted commits against PressureSink-style attrition (one of
//    the only bots that beat the parent).
//  - In long Frontier-vs-Frontier games (parent's losses are mostly
//    #2 finishes at 419–768 ticks), preserving border armies should
//    compound with def 40 instead of bleeding via failed kills.
// If the rating climbs we know the bonus was miscalibrated for low atk;
// if it drops, the 1.4x was load-bearing for opportunistic kills and
// the next descendant can tune the interior power threshold instead.
const ATTACKER_BONUS = 1.2;

export default {
  name: "Frontier_g4_41a970",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3_61b131 with ATTACKER_BONUS 1.4→1.2: low atk made the kill-confidence heuristic over-promise; be more selective.",
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
