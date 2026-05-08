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

// Parent (g4 0/0/50/0/50) crashed -165 from g3. Sibling g5_705be5
// already tested the atk-axis half-walkback (5/45). Two other
// siblings keep the parent's tech and beat it in different seeds —
// suggesting parent's tech isn't outright broken, just under-served
// by the frozen axes.
//
// Hypothesis: probe the *frozen* stack axis. Every ancestor had
// stack:0, and the loss list is dominated by Frontier-clone matchups
// where Spearhead-vs-Spearhead front pushes decide the game.
// Spearhead's value is stack momentum; even a small stack:10 should
// help our front armies arrive with more body than mirror opponents
// who left it at 0. Pull the 10 from def, since def:50 is the
// suspected overshoot from the parent's crash and going to def:40
// puts us back at the g3 floor on that axis.
//
// Reads:
//   - If rating recovers and beats g3 (1370): stack matters in this
//     build; future descendants should walk stack up further.
//   - If rating recovers only to ~g3 levels: def:40 was the floor and
//     stack is neutral; try pulling from prod next.
//   - If rating stays low: stack:10 doesn't carry mirror matchups and
//     the next descendant should pull from prod or atk instead.
export default {
  name: "Frontier_g5_e66353",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 0, def: 40 },
  description: "Frontier_g4 with 10 def → stack: probe the frozen stack axis to fuel Spearhead momentum in mirror matchups.",
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
