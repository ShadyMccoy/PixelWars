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

// Hypothesis: every ancestor in this chain (g0..g2) has frozen move at
// 0, so the briefing's frozen-column heuristic flags it as unexplored,
// not ruled out. Sibling g3_bd5683 already walked def further (40/20/40)
// and sibling g4_e7abc2 paid out on stack — both non-prod axes had
// headroom from the same neighborhood. Move is the only knob nobody on
// this lineage has touched. As a garrison floor, it specifically blunts
// the two threat profiles in the parent's recent losses: PressureSink's
// sustained attrition (we lost a 871-tick game to it on seed 357) and
// Frontier-mirror Spearhead chip damage in long mirror matchups (479,
// 502, 543, 558 ticks). Take 10 from prod → move: prod 50→40 still
// matches vanilla Frontier's pump, def 30 keeps the g1→g2 gain, atk 20
// keeps the 1.4x kill bonus active. If rating climbs we know move is
// alive and the next descendant can push it further; if it drops, the
// move axis is dead at 0 and we go back to def/stack.
export default {
  name: "Frontier_g3_524421",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 40, atk: 20, def: 30 },
  description: "Frontier_g2 with 10 prod → move: probe the only frozen tech axis in the lineage.",
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
