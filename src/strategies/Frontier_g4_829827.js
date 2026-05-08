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

// Hypothesis: tech axis has flattened (g3 only +1 over g2), so probe
// the act() logic instead. The cousin g6_7f7121's roadmap explicitly
// flagged the 0.5 INTERIOR power floor as the next thing to touch.
//
// In the parent, when role===INTERIOR and a pump target `next` exists
// but `army.attackPower <= 0.5`, the army does NOTHING and returns —
// SlowAndSteady is skipped. On a 30x22 wrap map with growth 1.8 and
// maxArmy 12, idle armies are expensive: every skipped tick is growth
// the front never sees. Recent losses (#2 / #3 finishes against
// Frontier_g5_ce16cd, g6_7f7121, g3_bd5683) were close-margin races
// where supply tempo matters.
//
// Single-knob change: instead of returning when the interior pump is
// too weak to fire, fall through to SlowAndSteady. The pump still has
// priority when power > 0.5; we only change behavior in the weak-army
// branch that currently idles. Tech is unchanged (inherited verbatim
// via spread of the parent's tech values).
//
// If rating climbs: weak-interior idling was leaving production on
// the table and SlowAndSteady's neutral-grab / drift is a strictly
// better default for low-power interior pieces. Future descendants
// can probe the 0.5 threshold itself or tighten the FRONT/INTERIOR
// role split.
// If rating drops: those weak interior pieces were intentionally
// stacking via inactivity and SlowAndSteady is dispersing them; next
// descendant should restore the return and probe a different lever
// (e.g. ATTACKER_BONUS or the role plan).
export default {
  name: "Frontier_g4_829827",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3_eaf9b1 with weak-INTERIOR fallthrough to SlowAndSteady instead of idling.",
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
        if (power > 0.5) {
          army.attack(next, power);
          return;
        }
      }
    }
    SlowAndSteady.act(army, game);
  },
};
