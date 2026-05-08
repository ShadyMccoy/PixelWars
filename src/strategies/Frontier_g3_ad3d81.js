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

// Hypothesis: parent (g2) walked def 20→30 and netted ~noise (+6).
// Sibling g3_eaf9b1 is already pushing the def axis further (def→40),
// so walking the same axis again would be duplicative. The lineage
// table shows `stack` and `move` are wholly frozen at 0 — those are
// the high-information directions to probe.
//
// Pick `stack` over `move`: the painter pattern's whole thesis is
// that INTERIOR tiles pump strength toward FRONT tiles via the
// supply chain, and FRONT then delegates to Spearhead which leans on
// stack momentum to crack borders. A bigger per-tile stack ceiling
// means the supply chain can deliver fatter pulses to the front and
// FRONT armies stay above the 0.5 power floor longer between ticks.
// Take 10 from prod → stack: prod is already saturated at 50 (steep
// diminishing returns past the midpoint), and the loss context shows
// we get out-pushed by other Frontier variants in long games — those
// are exactly the games where larger working stacks should compound.
// Same per-army logic, only tech changes; if rating climbs we know
// stack is alive; if it drops we know prod 50 was load-bearing.
export default {
  name: "Frontier_g3_ad3d81",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 20, def: 30 },
  description: "Frontier_g2 with 10 prod → stack: probe the unexplored stack axis to fatten supply-chain pulses.",
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
