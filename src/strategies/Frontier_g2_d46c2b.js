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

// Hypothesis: every descendant we have logs of probed either def
// (atk→def, prod→def) or stack (sibling g1_24609d). The move column
// is wholly frozen at 0 across this lineage — unexplored, not ruled
// out. Parent's recent losses are mostly attrition / late-game flips
// (winners take 583–683 ticks); painter waves rely on interior tiles
// marching to ROLE_FRONT via lowestDepthFriendlyNeighbor, and on
// lab1 (30×22 wrap) the supply chain is long. A higher move floor
// means reinforcements arrive at the front sooner, which directly
// counters PressureSink-style attrition without giving up the kill
// bonus (atk untouched).
//
// Smallest information-rich step: shift 10 prod → move. Prod stays
// dominant at 40, atk untouched at 30 to preserve the 1.4x kill
// branch, def held at 20. If rating climbs, the next descendant can
// push move further; if flat/down we know small move allocations
// don't pay and the chain swings back to def or stack.
export default {
  name: "Frontier_g2_d46c2b",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 40, atk: 30, def: 20 },
  description: "Frontier_g1 with 10 prod → move: probe the frozen move axis to speed interior→front waves.",
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
