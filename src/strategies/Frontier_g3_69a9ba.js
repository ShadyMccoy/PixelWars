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

// Hypothesis: parent (g2) won +20 walking atk→def. Sibling g3_eaf9b1
// already tests another step on that same axis (atk 10 / def 40), so
// repeating it would be redundant. The lineage's stack axis has been
// frozen at 0 the whole chain — totally unexplored. Parent's losses
// are mostly #2 finishes against other Frontier variants in close
// games (468–1258 ticks); the front role delegates to Spearhead, which
// rewards burst, and stack feeds that burst directly. Take a small
// step: pull 10 from prod → stack, keep the def gains intact (atk 20,
// def 30 unchanged). Why this should help without breaking what works:
//  - prod 50→40 still keeps the SlowAndSteady interior pump healthy
//    (vanilla Frontier won at prod 50, but g2_461435 also won at 40).
//  - stack 0→10 gives Spearhead noticeably stronger crashes on the
//    front, which is exactly the lever for tipping close Frontier-vs-
//    Frontier games where def 30 already kept us alive into the late
//    midgame.
//  - Defense is preserved so PressureSink attrition doesn't claw back
//    what we gain on the front.
// If rating climbs, stack is worth more exploration. If it drops,
// prod 50 was load-bearing here and we know to leave it alone.
export default {
  name: "Frontier_g3_69a9ba",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 20, def: 30 },
  description: "Frontier_g2 with prod 50→40, stack 0→10: open the unexplored stack axis to add burst to Spearhead's front pushes.",
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
