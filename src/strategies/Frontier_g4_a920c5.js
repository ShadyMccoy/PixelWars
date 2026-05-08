import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent's tech walk (atk 50->10, def 0->40) is now flat
// (+254, +39, +1). The atk knob is at 10 — close to the floor — yet
// every loser in season #250 was a Frontier variant that out-killed
// us in close games (859, 881, 717-tick grinds, plus a #5 finish to a
// factory build). With atk:10 we depend on the 1.4x ATTACKER_BONUS
// inflator to actually convert kill opportunities. Raising the bonus
// is the cheapest single-knob mutation to make tryKillAdjacent more
// permissive without spending a tech point.
//
// Why 1.55 (not 1.5 or 1.6):
//  - 1.5 is a token nudge; with def:40 mirrors prevalent in our
//    losses, we need a real margin shift to start clipping enemies
//    that 1.4 currently flags as un-killable.
//  - 1.6 risks committing armies to fights we still lose (with atk:10
//    we have no buffer if the inflated estimate is wrong) and bleeds
//    front presence Spearhead would otherwise use.
//  - 1.55 is one calibrated step: enough to flip ~1 borderline kill
//    per active front per several ticks, which over a 700-900 tick
//    Frontier-mirror grind compounds into territory.
//
// Why this should help against the specific loss context:
//  - PressureSink-style attrition (#2 in s155 from history): more
//    permissive kills mean we cull their farmed-attrition tiles
//    earlier instead of letting their border heal under our def.
//  - Mirror losses to Frontier / g3_69a9ba / g5_d0eeb0: those bots
//    win because at parity their stack/atk gives them slightly more
//    kill conversions; raising our bonus reclaims some of that
//    asymmetry without spending tech.
//  - Factory build (g6_8f4b09 #5 finish): we placed last because we
//    couldn't punish exposed tiles fast enough — looser kill rule
//    helps exactly there.
//
// If rating climbs: ATTACKER_BONUS is undertuned for atk:10 and
// future descendants should explore 1.6-1.7. If it drops: 1.4 was
// load-bearing at this atk level and we revert.
const ATTACKER_BONUS = 1.55;

export default {
  name: "Frontier_g4_a920c5",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3_eaf9b1 with ATTACKER_BONUS 1.4->1.55: convert more borderline kills to compensate for atk:10.",
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
