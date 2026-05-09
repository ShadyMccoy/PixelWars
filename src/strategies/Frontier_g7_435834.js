import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent already cashed in the offense knob
// (ATTACKER_BONUS 1.4 -> 1.5, +48 rating). Holding that gain and
// tweaking a different axis: interior supply throughput.
//
// The parent only forwards an INTERIOR army's stack down the depth
// gradient when attackPower > 0.5; weaker interior armies fall to
// SlowAndSteady, which scatters them. A sibling branch
// (Frontier_g4_5ef171, a winner against the parent) showed that
// dropping this threshold to 0.25 keeps weak interiors relaying
// toward the front and helps in long attrition matchups
// (Frontier-vs-Frontier mirrors at 590-830 ticks dominate the
// parent's recent losses).
//
// That tweak was validated on the g3 (atk 20/def 30) tech profile;
// applying it here on top of the parent's 1.5x bonus and 10/40 tech
// is the obvious orthogonal compounding step. Each successful
// adjacent-kill (now more frequent thanks to 1.5x) clears a front
// tile that benefits from a faster relay backfilling it -- the two
// changes should reinforce.
//
// One-knob change: INTERIOR_RELAY_MIN 0.5 -> 0.25. ATTACKER_BONUS
// stays at 1.5 (don't disturb the parent's confirmed gain). Tech
// inherited verbatim.
//
// If rating climbs, supply throughput is live on this profile too
// and the next descendant can step further (0.1?) or freeze. If it
// drops, 0.5 was load-bearing here even though it wasn't on g3,
// which would be useful info -- def-40 likely changes the cost
// of weak relay attacks getting punished mid-walk.
const ATTACKER_BONUS = 1.5;
const INTERIOR_RELAY_MIN = 0.25;

export default {
  name: "Frontier_g7_435834",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g6_f29ac0 with INTERIOR_RELAY_MIN 0.5 -> 0.25: keep weak interior armies relaying toward the front.",
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
