import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent finishes #2 of 6 in 4 of its 5 recent losses
// (#3 once). It's reaching the late game in contention but not
// closing — a "near-winner" pattern, not a "got crushed" pattern.
// The most cost-free aggression knob is ATTACKER_BONUS, which is
// the multiplier tryKillAdjacent uses to decide an adjacent kill is
// worth taking. Bumping 1.4 -> 1.5 makes the bot accept slightly
// thinner-margin kills on the front, converting some "almost killed
// the leader" turns into actual eliminations.
//
// Why 1.5 and not larger: ATTACKER_BONUS has been stable at 1.4
// across the entire winning sibling cohort (g1_ed1ff5, g3_bd5683,
// g3_eaf9b1). A step of +0.1 is the minimum probe that still gives
// the season a clean signal. If rating climbs, the next descendant
// can try 1.6 or move to a different lever; if it falls, we know
// 1.4 was tuned, not lazy, and stop walking this axis.
//
// Tech inherited verbatim from parent via spread — this lineage's
// tech ceiling has been the explicit experiment, and we're now
// testing the logic-mutation hypothesis.
const PARENT_TECH = { move: 0, stack: 0, prod: 50, atk: 10, def: 40 };
const ATTACKER_BONUS = 1.5;

export default {
  name: "Frontier_g6_882719",
  author: "shady",
  version: 1,
  tech: { ...PARENT_TECH },
  description: "Frontier_g5_ce16cd with ATTACKER_BONUS 1.4 -> 1.5: convert near-kills on the front into wins (parent finishes #2 a lot).",
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
