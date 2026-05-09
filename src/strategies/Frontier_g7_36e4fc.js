import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent's recent losses are still long mirror games
// (#2 at tick 649, #2 at tick 830, #5 at tick 759). Parent already
// nudged ATTACKER_BONUS 1.4 -> 1.5 to convert borderline kills, and
// rating climbed +48. Keep that knob; mutate the OTHER live axis.
//
// Sibling Frontier_g4_5ef171 — same tech as parent — demonstrated
// that lowering INTERIOR_RELAY_MIN from 0.5 -> 0.25 beats the
// parent. Reasoning: in long attrition games, the bottleneck is
// supply throughput to the front. Interior armies with power < 0.5
// currently fall through to SlowAndSteady, which scatters/wastes
// the action. At 0.25, weak interior tiles still walk down-depth
// toward the front, feeding Spearhead.
//
// One-knob mutation: keep parent's ATTACKER_BONUS=1.5 (validated by
// +48 last gen), drop INTERIOR_RELAY_MIN 0.5 -> 0.25 (validated by
// the sibling that beat the parent). The two changes are
// independent — front-tile kill commitment vs. interior relay
// throughput — so stacking them should compound rather than
// interfere. The expected lift is largest in exactly the long
// mirror games dominating parent's loss list.
//
// If rating drops, the two knobs interact (more aggressive front
// kills are starved by relay tiles that overcommit weak power),
// and the next descendant should revert relay back to 0.5 and
// look elsewhere (e.g. the power threshold for the kill check
// itself, or front-vs-interior role assignment).
//
// Tech is locked vs parent (lineage tech-search has flattened).
const ATTACKER_BONUS = 1.5;
const INTERIOR_RELAY_MIN = 0.25;

export default {
  name: "Frontier_g7_36e4fc",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g6_f29ac0 with INTERIOR_RELAY_MIN 0.5 -> 0.25: stack the sibling-validated relay throughput buff on top of parent's 1.5 attacker bonus.",
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
        if (power > INTERIOR_RELAY_MIN) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
