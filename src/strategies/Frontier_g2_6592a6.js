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

// Hypothesis: parent (g1) is atk 30, def 20, stack 0 and went 5/5
// losses against mostly attrition opponents (PressureSink + Frontier
// siblings with long ticks-to-completion). The lineage's g4 winner
// (Frontier_g4_e7abc2) demonstrated stack pays — it took 10 prod into
// stack and gained +43, the biggest single-step in that branch. Stack
// is still frozen at 0 in this parent line, so pulling it off zero is
// a high-information move.
//
// We have a 1.4x ATTACKER_BONUS on tryKillAdjacent already inflating
// kill power, so marginal atk has diminishing returns: kills that work
// at atk 20 mostly worked at atk 30 too. Meanwhile stack lifts the
// army cap so INTERIOR pulses arriving at FRONT come as bigger chunks
// instead of getting clipped by the cap on the way — Spearhead pushes
// stay above the 0.5 power floor across more consecutive ticks, which
// is exactly what attrition matchups reward.
//
// Small step: 10 atk → stack. Keeps prod 50 (load-bearing for tempo),
// keeps def 20 (siblings are exploring further def shifts; this step
// isolates the stack axis instead of confounding two changes). If
// rating climbs, stack >0 was overdue from g0; if it drops, ATTACKER
// kills were closer to the atk threshold than expected.
export default {
  name: "Frontier_g2_6592a6",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 20, def: 20 },
  description: "Frontier_g1 with 10 atk → stack: pull stack off zero to fatten INTERIOR→FRONT pulses.",
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
