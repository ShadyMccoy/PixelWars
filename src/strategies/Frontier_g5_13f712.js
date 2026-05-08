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

// Hypothesis: the parent (50 prod / 0 atk / 50 def) fell off a cliff
// (-185 vs g3) because zeroing atk strips the multiplier behind
// tryKillAdjacent's 1.4x ATTACKER_BONUS — kill-or-stay branches stop
// resolving and Spearhead swaps lose at the border. Both g4 siblings
// that beat this parent (g4_235131 at 40/10/50 and g4_5e42eb at
// 40/10/40+stack10) preserved atk=10, confirming "atk must be >0".
//
// What's still untested: the *minimum* atk needed to dodge the cliff.
// g3 (10 atk / 40 def, rating 1370) and the winning siblings all use
// atk=10. If atk=5 is already enough to restore the kill bonus, we
// keep more of the def gains the lineage just paid for: 0/0/50/5/45
// is half a step back along atk from the cliff but stays one step
// ahead of g3 on def.
//
// Expected outcome vs the loss context:
//  - vs Frontier_g4_235131 (50 def, 10 atk): we match its def, give
//    up 5 atk in the border swap. If def is the dominant term in the
//    duel — which the lineage trajectory says it is — losing 5 atk
//    matters less than keeping def=45.
//  - vs Frontier_g4_5e42eb (40 def, 10 atk, stack 10): we have +5 def
//    over it and no stack. Front tiles should be stickier under its
//    pressure.
//  - If rating climbs back toward (or past) g3, atk=5 is sufficient
//    and the next descendant probes atk=3 / def=47.
//  - If rating stays in cliff territory, atk needs to be ≥10 and the
//    next descendant walks back to 0/0/50/10/40 (= g3 tech, which has
//    a known 1370 rating to anchor against).
export default {
  name: "Frontier_g5_13f712",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 5, def: 45 },
  description: "Frontier_g4_ed149c with 5 def -> atk: half-step back from the atk=0 cliff to restore the kill bonus while keeping def above g3.",
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
