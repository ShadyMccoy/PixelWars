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

// Hypothesis: parent (atk:0/def:50/prod:50) cratered -177 vs grandparent.
// Three known winners over parent (5e42eb, bfd073, 0542d0) all kept
// atk >= 10 — so atk:0 is the prime suspect, not def:50. But before
// reverting atk (which 0542d0 already validated at prod:40/atk:10/def:50),
// test whether the def:50 ceiling is reachable by replacing atk with
// stack throughput instead.
//
// Take 10 from prod (50 -> 40) and put it on stack. New tech:
// stack:10, prod:40, atk:0, def:50.
//
// Why stack might compensate for atk:0:
//  - Spearhead's FRONT path wins via rear-stack momentum pushing through;
//    stack tech multiplies how much army survives the internal transfer
//    chain (lowestDepthFriendlyNeighbor -> attack-self), so more mass
//    arrives at the front per tick — exactly the lever Spearhead leans on.
//  - lab1's maxArmy:12 ceiling clips interior pumps; stack:10 reduces
//    transfer waste so the def:50 floor isn't paid for with empty fronts.
//  - Loss context (PressureSink + sustained-attrition Frontier mirrors)
//    is exactly where def:50 should shine IF mass reaches the line; the
//    parent likely had def to spare but no throughput to apply it.
//
// Clean A/B vs sibling 5e42eb (stack:10, prod:40, atk:10, def:40):
// same stack/prod, but trades atk:10 -> def:10 more. Tells us whether
// atk:10 floor is load-bearing or whether stack throughput alone is
// enough to win swap fights at the def extreme. If this climbs above
// 5e42eb, def:50 is reachable via stack; if it drops, atk:10 is the
// non-negotiable floor regardless of throughput.
export default {
  name: "Frontier_g5_7b94f1",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 0, def: 50 },
  description: "Frontier_g4 with 10 prod -> stack: probe whether stack throughput can reach the def:50 ceiling without restoring atk.",
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
