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

// Hypothesis: parent (atk 30 / def 20 / prod 50) climbed +30 by opening
// def. Of the three known winners over parent, two of them (ddb046 and
// 69a9ba) added stack — the only fully unexplored axis in this lineage
// — so stack looks like the next high-information knob. The third
// winner (eaf9b1) just pushed def harder, and a sibling on this g2
// branch is already going to walk that path; re-walking it is
// redundant.
//
// Smallest possible step: take 10 from atk → stack, keep def 20
// unchanged (preserve the gain that produced the +30). atk 30 → 20.
// Why low risk:
//  - tryKillAdjacent already inflates attacker power by 1.4x, so the
//    marginal kill threshold barely shifts when atk drops by 10.
//  - The interior pump (lowestDepthFriendlyNeighbor → attack-self
//    chain) compounds across every hop on lab1's 30×22 wrap map;
//    stack tech multiplies how much army survives those internal
//    transfers, which is exactly Frontier's central mechanic.
//  - Def 20 is preserved, so PressureSink-style attrition resistance
//    (the loss context that motivated the parent's def buy) doesn't
//    regress.
// Distinct from cousin ddb046 (which dropped def back to 10): this
// keeps parent's def floor intact while still testing the stack axis,
// so a rating climb here vs ddb046's rating tells us whether parent's
// def-20 anchor or ddb046's atk-30 anchor was the load-bearing piece.
export default {
  name: "Frontier_g2_bfd073",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 20, def: 20 },
  description: "Frontier_g1 with 10 atk → stack: open the unexplored stack axis while preserving parent's def-20 anchor.",
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
