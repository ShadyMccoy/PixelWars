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

// Hypothesis: parent (atk 0 / def 50) crashed to 1160 from g3's 1369
// (-209). def 50 is past the local optimum — the def-axis walk
// finally overshot. Walk-back tactic: restore def to the proven
// g3 level (40), but instead of returning the 10 points to atk
// (which just reproduces g3 verbatim and gives no new signal),
// spend them on stack — the only axis that has stayed at 0 across
// the entire lineage and is therefore unmeasured.
//
// Why this should help against the parent's loss context:
//  - 4/5 recent losses were to other Frontier-family bots that
//    out-attrited at the border. Reverting def:50→40 is the proven
//    floor; the bleed at def:50 was caused by the missing offensive
//    counterpunch, not by too much defense.
//  - Stack tech buffs the multiplier on stacked-army strikes, which
//    is exactly Spearhead's mode (it builds and shoves a column at
//    the front). A small stack:10 should make ROLE_FRONT pushes hit
//    a little harder without giving up the def floor that worked.
//  - tryKillAdjacent's 1.4x inflator already dominates lone-army
//    kill math, so we don't need raw atk to recover offense — stack
//    leverages the actual attack pattern (Spearhead momentum).
//
// If rating climbs: stack is a live axis, keep walking it. If it
// drops: the +209 hole is mostly the def overshoot itself, and a
// pure walk-back to g3 is the right next move.
export default {
  name: "Frontier_g5_c1f7f1",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 0, def: 40 },
  description: "Frontier_g4 walk-back: def 50→40 (proven floor), reinvest 10 into the unexplored stack axis to feed Spearhead momentum.",
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
