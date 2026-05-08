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

// Hypothesis: tech is locked (parent's 50/10/40 inherited verbatim);
// the one logic tweak is the interior-supply throughput threshold.
// Parent only forwards an INTERIOR army's stack along the depth
// gradient when attackPower > 0.5; otherwise it falls through to
// SlowAndSteady, which scatters/wastes the action.
//
// On lab1 (30x22 wrap, growth 1.8, maxArmy 12) the parent's worst
// recent results were long attrition games (s269 ticks=693, s298
// ticks=649). In those games supply-chain throughput is what feeds
// the Spearhead front; every interior tick that drops below 0.5 and
// gets handed to SlowAndSteady is a missed relay step. Lower the
// threshold to 0.25 so weaker interior armies still walk down-depth
// toward the front instead of wandering. This should help most
// against the long, stable matchups (Frontier-vs-Frontier mirrors,
// Cordon, Stockpile) that dominated the parent's losses, while
// barely affecting fast games where armies build up past 0.5
// quickly anyway.
//
// If rating drops, 0.5 was load-bearing (relay attacks below it lose
// more than they gain) and the next descendant should walk back the
// other way (try 0.75) rather than tweak a different axis.
const INTERIOR_RELAY_MIN = 0.25;

export default {
  name: "Frontier_g4_5ef171",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3_eaf9b1 with interior relay threshold 0.5 -> 0.25: more weak interiors keep relaying instead of falling to SlowAndSteady.",
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
        if (power > INTERIOR_RELAY_MIN) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
