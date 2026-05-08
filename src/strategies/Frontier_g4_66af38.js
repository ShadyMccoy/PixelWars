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

// Hypothesis: g2→g3 (atk 20→10, def 30→40) jumped +241 rating. The
// def axis is still the productive direction, and the 1.4x
// ATTACKER_BONUS keeps adjacent-kill math working even at low atk.
// Take the final 10 from atk → def (atk 10→0, def 40→50): commit
// fully to a defense-maxed border. Against Frontier_g2_461435 (the
// only bot that consistently beat the parent in season #156, running
// atk:50/def:10), a wall this stiff should bleed Spearhead pushes
// across multiple ticks instead of folding on the swap. If rating
// drops, the corner is somewhere between def 40 and 50; if it climbs
// again, we know the optimum is a defense-pinned build and the next
// generation should explore prod or stack instead of atk/def.
export default {
  name: "Frontier_g4_66af38",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with the last 10 atk → def: commit to a defense-maxed border after a +241 jump.",
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
