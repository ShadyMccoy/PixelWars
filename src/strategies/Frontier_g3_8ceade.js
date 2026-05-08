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

// Hypothesis: lineage has only ever moved chips between prod/atk/def.
// Both `move` and `stack` are still 0 — frozen columns the table flags
// as unexplored, not ruled out. Sibling g3_bd5683 already takes the
// "keep climbing def from prod" path (40/20/40); duplicating that
// exploration adds no information. Try the orthogonal axis instead:
// pull 10 from prod into `stack` (now 0/10/40/20/30). On lab1
// (maxArmy=12), stack raises the per-tile cap so painter-pumped
// interior strength doesn't waste against the ceiling on front tiles
// — it lets def 30 fronts bank larger reserves before capping, which
// directly compounds with our def-heavy survival profile vs the
// sustained pressure that vanilla Frontier and Frontier_g2_461435
// (atk 50) apply. If stack helps, we walk it; if it doesn't move the
// rating, the next descendant can try `move` (garrison floor) instead.
export default {
  name: "Frontier_g3_8ceade",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 20, def: 30 },
  description: "Frontier_g2 with 10 prod → stack (0/10/40/20/30): probe the unexplored stack axis to raise the per-tile cap on def-heavy fronts.",
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
