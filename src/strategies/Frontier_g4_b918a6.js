import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis (logic-only mutation; tech inherited verbatim from parent):
// The lineage walked atk down 50 → 30 → 20 → 10 over four generations
// while ATTACKER_BONUS stayed pinned at 1.4. That bonus is the *only*
// thing inflating the kill-or-stay branch's effective attack, and at
// atk=10 it's doing more of the work than ever — a kill the parent
// barely lands at 1.4 might be missed entirely if pressure timing
// shifts. Parent's recent losses are mostly close #2 finishes against
// other Frontier variants (g1_0c6381 has atk 30, g3_69a9ba has atk 20)
// and one loss to PressureSink-style attrition; in both regimes,
// converting a few extra adjacent kills per game flips swing tiles
// without touching the def 40 stiffness that's been earning us rating.
// Bump ATTACKER_BONUS 1.4 → 1.6 — single knob, no role-rule change,
// no tech change. If rating climbs, the bonus had drifted under-tuned
// as atk fell; if it drops, 1.4 is genuinely the local optimum and
// future descendants leave it alone.
const ATTACKER_BONUS = 1.6;

export default {
  name: "Frontier_g4_b918a6",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3_61b131 with ATTACKER_BONUS 1.4 → 1.6: recover kill conversions lost as atk tech walked down to 10.",
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
