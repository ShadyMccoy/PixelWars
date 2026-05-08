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

// Hypothesis: parent at 0/0/50/0/50 dropped -173 vs g3. Parent's own
// falsification rule said: "if rating drops, atk=10 was the floor and
// walk back to g3." Two siblings (g4_a9b303, g4_490175) did exactly
// that route — restored atk=10 by pulling from prod — and BOTH beat
// the parent. So atk=0 is the floor and prod=50 has slack.
//
// But I don't want to just copy the winning siblings (already in the
// pool at 0/0/40/10/50). Take their validated frame and extend by
// one small step on a different axis: probe stack=10 by pulling
// another 10 from prod. So 0/10/30/10/50.
//
// Why stack here:
//  - At atk=10 (kill math restored) Spearhead's value comes from
//    stack momentum carrying through borders. The stack axis is
//    completely unexplored in this lineage (frozen at 0 across g0-g4).
//  - Sibling g3_ad3d81 reportedly gained on the stack axis, which is
//    the only direct evidence we have that stack pays in this build.
//  - prod=50 was already shown over-allocated by the two winning
//    siblings dropping it to 40 with no apparent loss to the supply
//    chain; pulling another 10 to 30 is more aggressive but the
//    painter's interior pumping is what matters more than raw prod.
//
// Falsification: if rating drops vs the 0/0/40/10/50 baseline, prod=30
// is below the supply-chain knee or stack=10 doesn't pay; next step
// would walk prod back to 40 and try move instead.
export default {
  name: "Frontier_g5_91ec24",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 30, atk: 10, def: 50 },
  description: "Restore atk=10 (parent's rule: atk=0 was the floor); from sibling-winner frame 0/0/40/10/50, pull 10 more prod into the unexplored stack axis.",
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
