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

// Hypothesis: parent (g3_eaf9b1) is locked at tech 0/0/50/10/40 — def
// is maxed out for the lineage and rating only nudged +1 over g2.
// Recent losses are close games (462–782 ticks) lost to other Frontier
// variants. The lineage is bottlenecked at the front, not at survival.
//
// Logic-only mutation: raise the interior pump threshold from 0.5 → 1.0.
// The supply chain currently fires whenever a friendly interior tile
// has attackPower > 0.5, dribbling small packets one tile at a time.
// With def=40, strength sitting on a friendly interior tile is very
// well-protected, so the cost of waiting another tick is near zero.
// Sending larger packets means:
//   - When the packet finally lands on a ROLE_FRONT tile, Spearhead
//     has more strength to spend on a meaningful crash. Close
//     Frontier-vs-Frontier games tip on the size of the burst that
//     arrives at the contested edge, not the rate of trickle.
//   - Fewer wasted partial moves capped by maxArmy=12 saturation in
//     interior corridors.
// If rating climbs, the supply chain was over-eager and packet size
// matters more than cadence — next descendant can push to 1.5. If it
// drops, the trickle was load-bearing (probably because lab1's 30×22
// wrap geometry rewards rapid relay over burst) and we revert.
const INTERIOR_PUMP_THRESHOLD = 1.0;

export default {
  name: "Frontier_g4_99bff0",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3_eaf9b1 with interior pump threshold 0.5→1.0: send larger packets toward the front for bigger Spearhead crashes.",
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
        if (power > INTERIOR_PUMP_THRESHOLD) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
