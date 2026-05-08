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

// Hypothesis: parent (g3) shifted 10 prod → stack and gained +43 rating,
// the biggest single-step jump in this lineage. That's strong evidence
// the stack axis is alive and was previously under-invested. Most of
// the parent's recent losses are mirror matches against Frontier
// siblings — long ticks-to-completion games (463, 611, 410, 574) where
// supply-chain throughput compounds. Push the same axis one more notch:
// take another 10 from prod → stack (prod 40→30, stack 10→20). Prod
// stays well above the floor (g1 at 50 only beat g0 by chance and lost
// rating relative to vanilla), and a fatter stack ceiling lets INTERIOR
// pulses arrive at FRONT in bigger chunks so Spearhead pushes stay above
// the 0.5 power floor across more consecutive ticks. If rating climbs
// again, stack still hadn't peaked at 10; if it drops, prod 40 was the
// load-bearing knob and we backtrack toward the g3 split.
export default {
  name: "Frontier_g4_e7abc2",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 20, prod: 30, atk: 20, def: 30 },
  description: "Frontier_g3 with another 10 prod → stack: push the axis that just paid +43.",
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
