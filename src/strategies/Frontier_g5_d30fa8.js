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

// Hypothesis: the parent's gamble (atk 10 -> 0, def 40 -> 50) was the
// cliff edge. Lineage was monotonically climbing on the def axis
// (g0 1294, g1 1331, g2 1359, g3 1370) and then collapsed at g4 to
// 1188 (-182). The diminishing-then-positive Δ at g3 (+11) was the
// tail of the climb, not headroom — atk=0 broke the build.
//
// Why atk=0 collapses harder than the parent expected:
//  - tryKillAdjacent's 1.4x ATTACKER_BONUS multiplies the post-tech
//    attack value; with atk multiplier at zero-tech baseline, the
//    bonus has nothing to amplify and the kill threshold checks fail
//    on tiles that previously flipped at atk=10.
//  - Spearhead's pushes spend attackPower; lower atk multiplier means
//    each spend transfers less, so the same stack momentum produces
//    fewer flips per turn.
//  - Front tiles getting "stickier" via def 50 doesn't matter if we
//    can't convert pressure into territory — we just sit and lose to
//    siblings whose atk is non-zero.
//
// The corrective move: revert to g3's proven 10/40 split, then open
// the stack axis (untouched across the whole lineage at 0). Take 10
// from prod and put it in stack. Stack scales the per-turn momentum
// that Spearhead leans on; it's the cleanest unexplored axis and the
// one most directly aligned with the kill/push logic that atk=0 just
// proved is load-bearing.
//
// If rating climbs vs g3 (1370), stack is the new axis to walk. If
// it drops, prod 50 is sticky and the next descendant pivots to move
// instead. Either way we leave the cliff and learn something new.
export default {
  name: "Frontier_g5_d30fa8",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Walk back from the atk=0 cliff to g3's 10/40 split and open the stack axis (prod 50 -> 40, stack 0 -> 10).",
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
