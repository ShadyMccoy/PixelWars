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

// Hypothesis: parent's def=20 is over-committed. Both cousins that beat
// the parent (g2_ddb046 and g2_461435) settled on def=10, suggesting
// the marginal 10 def beyond that point is wasted weight. Meanwhile
// `move` is the one axis that has stayed frozen at 0 through the entire
// Frontier lineage — totally unexplored, so a probe here is high-info
// regardless of outcome.
//
// Take 10 from def and put it in move (def 20→10, move 0→10). The bot's
// core mechanic is a long interior→front supply pump on lab1 (30×22
// wrap, longest path on the board); move tech lifts the garrison floor
// which should let interior `army.attack(next, power)` transfers shove
// more strength forward each tick without losing kill-or-stay rate
// (still backed by the 1.4x attacker bonus). Holding def=10 keeps
// borders at the level the winning cousins already validated.
//
// If rating climbs we know move is undervalued for this supply-chain
// architecture; if it drops we've ruled out a free axis cheaply.
export default {
  name: "Frontier_g2_743627",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 50, atk: 30, def: 10 },
  description: "Frontier g2: 10 def → 10 move to probe the unexplored axis and accelerate the supply pump.",
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
