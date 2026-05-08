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

// Hypothesis: parent diagnosed its own problem as "paper-thin contested
// front tiles" losing the war of attrition (PressureSink, Frontier_g3
// variants). The parent's chosen fix was atk→def (more durable borders
// when hit). Sibling branches confirm def is a live axis. But the
// lineage tech chart shows BOTH move and stack frozen at 0 across every
// generation — entirely unexplored.
//
// Try the move axis instead of walking def again. Move buys garrison
// floor: tiles keep a baseline army even after they spend, which
// attacks "the tile reaches zero" failure mode at its source rather
// than after the fact. That's exactly what attrition opponents like
// PressureSink exploit — sustained pressure on tiles whose garrisons
// dip below the kill threshold between our act() ticks.
//
// Shift 10 atk → move (atk 30→20, move 0→10). Atk at 20 is still above
// the def-maxed g3_eaf9b1 (atk 10) which won, and tryKillAdjacent
// already gets 1.4x — kills that succeed at atk 30 mostly succeed at
// atk 20. If move pays, the next descendant pushes it further; if it
// regresses, we know the move axis is dead and resume the def walk.
export default {
  name: "Frontier_g2_9413f3",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 50, atk: 20, def: 20 },
  description: "Frontier_g1 with 10 atk → move: probe the unexplored garrison-floor axis to keep border tiles above the attrition kill threshold.",
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
