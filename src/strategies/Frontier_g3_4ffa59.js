import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent inherits tech 20/30 (atk/def) from g2, with the
// def 20→30 step worth +40. The def buff makes border tiles stickier
// in counterattack — a kill-then-survive trade pays off more reliably
// because the leftover unit on a captured tile now absorbs reprisal
// better. tryKillAdjacent's ATTACKER_BONUS (1.4) decides which
// marginal kills to commit to; with def 30 backing us up, the
// effective break-even on "commit to this kill" has shifted in our
// favor relative to the bonus that was tuned for def 0.
//
// Loss context: parent finishes #2–#4 in close games against other
// Frontier variants and Hammer/Cordon-style pressure; it wins the
// midgame defensively but doesn't convert enough border breakthroughs
// to claim #1. Raising ATTACKER_BONUS from 1.4 → 1.6 lets the painter
// commit to slightly more kill-or-stay trades on the front, where the
// def buff keeps the captured tile alive into the next tick instead
// of bleeding back. This is a one-knob logic tweak — tech inherited
// verbatim from the parent.
//
//  - If rating climbs: 1.4 was tuned for an under-defended bot and
//    g2's def-heavy build is leaving border kill margin on the table.
//    Future descendants can keep walking the bonus axis.
//  - If rating drops: 1.4 was already past the optimum for this
//    matchup mix and the extra commitments are getting punished by
//    the second-neighbor counterattacks the painter doesn't see.
//    Next descendant should walk back or freeze it.
const ATTACKER_BONUS = 1.6;

export default {
  name: "Frontier_g3_4ffa59",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 20, def: 30 },
  description: "Frontier_g2 with ATTACKER_BONUS 1.4→1.6: cash in the def-30 buff by committing to more marginal border kills.",
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
