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

// Hypothesis: the def axis keeps paying (g0→g1 +20, g1→g2 +18,
// g2→g3 +25). Parent (g3) is at 50/10/40 and the same-size atk→def
// step would zero atk — that's a known cliff because tryKillAdjacent
// still leans on atk via the 1.4x ATTACKER_BONUS multiplier. Sibling
// g3_bd5683 (40/20/40) showed prod→def is a viable alternate source,
// and beat this parent. So pull the next 10 from prod instead of atk:
// 50/10/40 → 40/10/50. We keep climbing def (the live axis against
// PressureSink and atk-heavy Frontier variants in the loss context)
// while preserving atk=10 so kill-or-stay branches still resolve the
// way they did at g3. If rating flatlines or drops, def 50 with this
// prod cost is the saturation point and the next descendant should
// stop walking def.
export default {
  name: "Frontier_g4_235131",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 10, def: 50 },
  description: "Frontier_g3 with 10 prod → def (now 40/10/50): keep climbing def, preserve atk=10 for kill bonus.",
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
