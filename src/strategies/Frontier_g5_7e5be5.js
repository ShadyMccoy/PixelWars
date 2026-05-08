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

// Hypothesis: the parent (g4_c1a729, 50/0/50) zeroed atk and fell off
// a -171 cliff after a clean +37/+28/+11 climb on the def axis. The
// most likely cause is that atk=0 collapses the offensive pipeline:
//  - tryKillAdjacent's 1.4x ATTACKER_BONUS multiplies the atk
//    multiplier, so atk=0 turns marginal adjacent kills into stalls.
//  - Spearhead pushes still scale with atk on transferred strength.
// Diminishing returns on def (+11 at the last step) had already
// signaled saturation, so the cliff at atk=0 was the failure, not
// def=50 being intrinsically wrong. A sibling at 40/10/50 (g4_235131)
// beat this parent — same diagnosis, restoring atk=10 from prod.
//
// Single targeted change vs the parent: prod 50→40, atk 0→10. Keep
// def=50 to test whether def-50 itself is still net positive once
// kills resolve again. Why this should beat the parent:
//  - Restores the kill-or-stay branching that paid off through g3.
//  - Keeps the def stacking that should still blunt PressureSink and
//    other attrition-style bots in the recent loss list.
//  - Pulls from prod (frozen at 50 the whole lineage) rather than
//    def, so we learn whether prod=50 is over-spent.
// If rating recovers toward g3's 1369 the diagnosis is right; if it
// flatlines we'll need to walk def back too.
export default {
  name: "Frontier_g5_7e5be5",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 10, def: 50 },
  description: "Frontier_g4 with prod 50→40, atk 0→10: restore the atk=10 floor that kills need, keep def=50 to test whether atk=0 (not def=50) was the cliff.",
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
