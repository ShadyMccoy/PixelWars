import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: continue the ATTACKER_BONUS climb. The lineage has
// produced a clean monotonic signal on this single knob:
//   g5_ce16cd (1.40) -> 1226
//   g6_882719 (1.50) -> 1241  (+15 from the 1.4 -> 1.5 step)
// The parent's own exit comment said "if rating climbs, the next
// descendant can try 1.6". Independent corroboration: the winner
// Frontier_g4_a920c5 (which beat the parent in season #280, seed 279)
// runs ATTACKER_BONUS=1.55. So 1.55 is *already validated* as
// strictly better than the parent on at least one matchup, and sits
// exactly halfway between the parent's value and the value the
// parent itself flagged as the next probe.
//
// Why 1.55 and not 1.6:
//  - 1.55 is the smallest step consistent with the parent's plan
//    that also matches a known-winner value, so we get two
//    converging priors instead of one.
//  - 1.6 is more aggressive but with atk:10 we have no buffer; if
//    the inflated kill estimate misses, we lose the front tile to
//    the counterattack. Walking by 0.05 keeps the season signal
//    clean — if 1.55 also climbs, the *next* descendant is the one
//    that should try 1.6 / 1.65.
//  - 4 of the parent's 5 recent losses are #2-of-6 finishes. That
//    "near-winner" pattern is exactly what a slightly looser kill
//    rule converts: one extra clipped enemy on the late-game front
//    flips a #2 into a #1.
//
// Tech inherited verbatim from parent — this lineage's tech ceiling
// is a settled experiment; the logic-mutation hypothesis is the one
// being tested.
const PARENT_TECH = { move: 0, stack: 0, prod: 50, atk: 10, def: 40 };
const ATTACKER_BONUS = 1.55;

export default {
  name: "Frontier_g7_f34b76",
  author: "shady",
  version: 1,
  tech: { ...PARENT_TECH },
  description: "Frontier_g6_882719 with ATTACKER_BONUS 1.5 -> 1.55: continue the validated climb (parent +15, sibling-winner uses 1.55).",
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
