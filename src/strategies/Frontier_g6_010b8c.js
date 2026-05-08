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

// Hypothesis: tech is locked at parent's 50/10/40 (prod/atk/def). All
// 5 of parent's recent losses are long games (405–707 ticks) where it
// survives well (def 40 holds borders) but never cracks through —
// finishing #2–#4 rather than winning. The signature of a starved
// front: interior tiles accumulate strength, fail the 0.5 power gate,
// and sit idle while the front gets out-pushed by sibling Frontiers.
//
// One-knob tweak: drop the INTERIOR push threshold from 0.5 → 0.25.
// With prod 50 the per-tile strength refills fast, so 0.5 is leaving
// small but useful pulses parked. Lower floor → more frequent supply
// pulses toward the front → continuous reinforcement in attrition
// fights. We're not changing what an INTERIOR army does, only how
// often it gets to do it. If this overspends and starves the rear,
// the season will show a dip and we walk it back.
export default {
  name: "Frontier_g6_010b8c",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g5 with INTERIOR push threshold 0.5 → 0.25: keep the supply chain pulsing in long attrition games.",
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
        if (power > 0.25) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
