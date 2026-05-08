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

// Hypothesis: parent (prod 50 / atk 30 / def 20) won its def-axis bet
// (+32 vs g0) but is now losing 2/5 to PressureSink and the rest to
// Frontier cousins. The cousin that beat it on stack — g2_ddb046 —
// tried { stack 10, prod 50, atk 30, def 10 }, taking 10 from atk.
// That probe validated stack as a real lever for the interior→front
// supply pump on lab1's 30×22 map with maxArmy 12.
//
// We want the stack gain WITHOUT giving back the parent's hard-won def.
// Take 10 from prod (still the dominant axis at 40 after the cut)
// instead. Net: { move 0, stack 10, prod 40, atk 30, def 20 }. Pump
// throughput drops slightly, but each pump moves more usable strength
// (stack), and the border keeps the def 20 cushion against PressureSink
// attrition. If rating climbs, stack stacks (heh) on top of def in the
// Frontier shell; if it sags, the prod cut was the bottleneck and we
// should pull from atk next time instead.
export default {
  name: "Frontier_g2_bd2a33",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 30, def: 20 },
  description: "Frontier g2: 10 prod → 10 stack, keep def 20 — supply-pump probe without giving back border thickness.",
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
