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

// Hypothesis: parent (g5, atk:3/def:47) jumped +305 from the g4 crash,
// confirming the kill-margin cliff lives below atk:3 and that 3 atk is
// enough to keep tryKillAdjacent's 1.4x bonus paying. Parent's own
// roadmap said: "we can keep pushing def in future descendants while
// only paying 3 atk for kill-margin safety. Useful because def's
// marginal slope was still +11 at g3 and may not be exhausted yet."
//
// Def has been climbing monotonically (0→20→30→40→47) and so far the
// slope hasn't flattened. The only donor left is prod — atk is pinned
// at the safety floor. Take 5 from prod → def: prod 50→45, def 47→52.
//
//  - If rating climbs: def's marginal slope is still alive past 50, and
//    prod=50 is no longer load-bearing at this defense level (longer
//    holds amortize the lost growth). Future descendants can pull more
//    prod into def in 5-pt steps until rating flattens.
//  - If rating drops: prod=50 IS load-bearing — we lose the income race
//    against atk-heavy variants like Frontier (the s57 winner above)
//    and the parent's def:47 is at or near the local optimum on this
//    axis. Next descendant should freeze tech and probe behavior
//    instead (e.g. raise the 0.5 power floor on INTERIOR delegation,
//    or tighten the role split).
//
// Step size matches the prior atk:0→3 half-step rather than a full 10,
// because we're now in the post-crash regime where surprises hurt more
// and the lineage table shows recent steps shrinking (+9, then crash,
// then +305 recovery — variance is high near these knobs).
export default {
  name: "Frontier_g6_7f7121",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 45, atk: 3, def: 52 },
  description: "Frontier_g5 with 5 prod → def (now 45/3/52): probe whether def's slope is still alive past 50 with atk pinned at the safety floor.",
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
