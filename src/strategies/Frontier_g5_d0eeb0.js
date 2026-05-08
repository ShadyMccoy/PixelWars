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

// Hypothesis: parent's def 40->50 step was the cliff (Δ -178 vs g3).
// def:50 has clearly overshot, so the def axis is finally done. The
// move now is to walk def back to 40 AND redeploy the freed point to
// a fresh axis instead of just reverting to g3's atk:10.
//
// Sibling Frontier_g4_5e42eb validated stack:10 beating this very
// parent, but it paid for stack out of prod (prod 50->40). Its build
// gave up some interior throughput to gain the stack burst. Here we
// instead pay for stack out of def (def 50->40), keeping prod:50 and
// atk:0. This is the unexplored cell: stack:10 combined with the
// max-prod / no-atk shape that the late-lineage walk produced.
//
// Why this should help vs the loss context:
//  - Parent lost to be2ba4/39c6ff (mirror tech) and to g4_5e42eb
//    (stack:10/def:40). Mirror losses are noise, but the 5e42eb loss
//    is a real signal that stack matters at maxArmy:12 — interior
//    waves clip without it. Adding stack:10 directly addresses that.
//  - vs PressureSink-style attrition: def:40 still buys most of the
//    border-stickiness gain (lineage went 0->20->30->40 monotonically
//    upward); only the last 10 was negative.
//  - vs Frontier_g2_453833 / g4_047f81 factory-generated builds: a
//    stack burst on top of prod:50 means our interior pumps actually
//    arrive at the front with weight, which the painter's INTERIOR
//    relay path is built to deliver.
//
// If rating climbs: stack is alive, prod-stack mix is the next axis.
// If it drops: stack doesn't compose with prod:50/atk:0 and we should
// fall back to g3's atk:10/def:40 baseline next gen.
export default {
  name: "Frontier_g5_d0eeb0",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 0, def: 40 },
  description: "Walk def 50->40 (cliff confirmed) and spend the freed point on stack:10, keeping prod:50/atk:0.",
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
