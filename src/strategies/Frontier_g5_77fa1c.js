import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent's ATTACKER_BONUS=1.55 was a clear miss — rating
// fell -179 vs g3 (1264 -> 1085). The three bots that just beat the
// parent in s274 cluster at the OPPOSITE end of this knob:
//   - Frontier_g7_cd2096: 1.25
//   - Frontier_g4_689cfb: 1.30
//   - Frontier_g3_61b131: 1.40 (the original)
// At atk=10 / def=40, the consistent story is that a permissive bonus
// commits armies to kill attempts the engine then loses, donating
// units into def-heavy mirrors. The proven basin is 1.2-1.4. 1.55 is
// outside it; 1.25, 1.30, 1.40 are inside it.
//
// One-knob change: ATTACKER_BONUS 1.55 -> 1.35.
// 1.35 sits between two confirmed winners (1.30 and 1.40) and has not
// itself been tested in this lineage. Picking the gap rather than
// re-running 1.30 or 1.40 actually probes whether the basin is
// smooth (1.35 ~= avg of two winners, should also win) or whether
// there is a thin local optimum at exactly 1.40 / 1.30.
//
// Why this should help against parent's loss context:
//  - 4-of-5 recent losses are 500-1015 tick mirrors against other
//    Frontier variants — i.e. attrition fights where wasted swings
//    cost a tile each time tryKillAdjacent green-lit a borderline
//    attempt at 1.55 that didn't actually convert. Tightening to
//    1.35 cuts the worst of those without abandoning the conversions
//    1.30 already accepts.
//  - Loss to factory bot Frontier_g1_ed1ff5 (#5 finish): a tighter
//    kill rule preserves border strength under sustained pressure
//    instead of bleeding into their farmed attrition.
//
// If rating climbs back near g3's 1264 the basin is smooth and the
// next descendant can stay in 1.30-1.40 and explore other levers
// (interior power>0.5 threshold, role gating). If it lands clearly
// below the 1.30/1.40 winners, the basin has a local dip in the
// middle and we should pick exactly one of the proven endpoints.
//
// Tech is locked vs parent.
const ATTACKER_BONUS = 1.35;

export default {
  name: "Frontier_g5_77fa1c",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g4_a920c5 with ATTACKER_BONUS 1.55 -> 1.35: revert into the proven 1.25-1.40 winning basin for atk-10/def-40, probing the untested midpoint between 1.30 and 1.40.",
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
