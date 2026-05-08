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

// Hypothesis: the def-axis walk is accelerating, not flattening.
// Lineage deltas: g1 -4, g2 +14, g3 +44 — each 10-point shift toward
// def has paid more than the last. Same painter, same Spearhead/kill
// logic; the only thing changing is how much border tiles soak.
//
// Take the final step: atk 10 → 0, def 40 → 50. This is the last
// move on this axis (atk can't go negative), so it's also the
// definitive read on whether atk has any marginal value at all in
// this build. The case it should still help:
//   - tryKillAdjacent already inflates by 1.4x, and the kills that
//     succeed at atk=10 are mostly the ones where the 1.4x carries
//     them; pure atk tech is a small additive on top.
//   - Spearhead's value comes from stack momentum, not raw atk.
//   - PressureSink (the recurring #1 against us at seeds 365, 339)
//     wins by sustained border attrition — def 50 is the maximal
//     counter, and we still lost #2 in seed 393 to a Frontier_g1
//     whose only edge over us was a different tech split.
// If rating drops, we know atk=10 was the floor and walk back to g3.
export default {
  name: "Frontier_g4_c9d674",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with the last 10 atk → def: terminal step on the def axis after accelerating gains.",
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
