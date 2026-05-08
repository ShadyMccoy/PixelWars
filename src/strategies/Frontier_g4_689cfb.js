import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: tech is locked at parent's atk 10 / def 40 — the lineage
// has flattened (g3 only +4 over g2) and 3 of 5 recent losses are to
// other Frontier variants running the SAME painter logic with HIGHER
// atk (Frontier_g1_ed1ff5 atk=40, Frontier_g2_34255e atk=20, vanilla
// Frontier atk=50). Tech alone won't differentiate against cousins,
// so move the lever in act().
//
// Single change: ATTACKER_BONUS 1.4 → 1.3.
// tryKillAdjacent uses this multiplier to *decide* whether to attempt
// a kill. With atk=10 our raw kill margin is the thinnest in the
// lineage; the 1.4x bonus that worked at atk 50/40/20 is now over-
// optimistic — we attempt kills the engine then refuses, bleeding
// border tiles to defense-heavy attackers. 1.3 tightens the criterion
// (only attempt kills with more headroom) which:
//   - costs us very few kills (the deep-margin ones still pass 1.3)
//   - preserves more border strength to ride out PressureSink-style
//     attrition where def 40 actually pays off
//   - leaves interior pump and Spearhead behavior untouched
// If rating climbs we keep tightening; if it drops, the lost
// marginal kills mattered more than the saved border tiles.
const ATTACKER_BONUS = 1.3;

export default {
  name: "Frontier_g4_689cfb",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3_61b131 with ATTACKER_BONUS 1.4→1.3: tighten kill criterion to match low atk=10.",
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
