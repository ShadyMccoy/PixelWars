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

// Hypothesis: walk back from the atk=0 cliff.
//
// The parent's own falsification clause said: "if rating drops here,
// def 40 was the local optimum and the next descendant should walk
// back." It dropped hard: g3 1370 → g4 1175 (-195). The lineage gains
// on the atk→def walk were also decelerating, not accelerating
// (+37, +28, +11 across g1/g2/g3) — the parent's "the slope is
// steepening" reading was wrong. So the right next step is to walk
// back one notch: def 50→40, atk 0→10.
//
// Why expecting recovery (and possibly more):
//  - The parent argued atk only feeds tryKillAdjacent's kill math via
//    the 1.4x ATTACKER_BONUS, so atk=0 should be cheap. Empirically
//    that's contradicted by -195 — atk=0 is a real cliff, likely
//    because the kill multiplier still rides the atk tech curve and
//    Spearhead's front-tile resolution leans on atk too.
//  - Sibling g4_235131 (40/10/50) — same def=50 but kept atk=10 —
//    actually beat this parent. That isolates atk=0 as the load-
//    bearing failure mode, not def=50. We could mirror 235131, but
//    that's a sibling clone; the cleaner experiment is to confirm
//    that the def=40/atk=10 plateau (g3's tech) was the real local
//    optimum and use that as the launch pad for the next axis (stack).
//  - The PressureSink/Frontier-clone loss context still favors def
//    over raw atk, so def 40 should still blunt border attrition while
//    atk=10 keeps adjacent kills resolving the way they did at g3.
//
// Falsification: if rating still sags below g3 (~1370), the atk=0
// cliff isn't the only thing wrong with this lineage and the next
// descendant should open the unexplored stack axis instead of
// retreading move/atk/def.
export default {
  name: "Frontier_g5_62b210",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g4 walked off the atk=0 cliff; revert one notch (def 50→40, atk 0→10) to confirm the g3 plateau.",
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
