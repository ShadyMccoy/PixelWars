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

// Hypothesis: parent's comment flagged the next move — if def keeps
// paying, pull from prod next. g1→g2 (atk 30→20, def 20→30) gave +215,
// so def is clearly the live axis. Atk at 20 is already thin; cutting
// it further risks losing winnable kills via the 1.4x attacker bonus
// (parent lost to Frontier 50/50/0 and PressureSink, both atk-heavy).
// Instead shift 10 prod → def (now 40/20/40) to keep climbing def while
// preserving kill power. If def saturates here, season rating will flat
// or dip and the next descendant can try pulling stack/move instead.
export default {
  name: "Frontier_g3_bd5683",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 20, def: 40 },
  description: "Frontier_g2 with 10 prod → def (now 40/20/40): keep climbing def, preserve atk for kill bonus.",
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
