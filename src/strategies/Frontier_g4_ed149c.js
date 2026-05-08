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

// Hypothesis: the lineage has walked atk -> def in steady 10-point
// steps and gained every time (g1 +0, g2 +22, g3 +19). Δ is still
// positive at parent (+19), so the def axis hasn't bottomed out yet.
// Take one more step of the same size: atk 10 -> 0, def 40 -> 50.
//
// Why this should still pay vs the loss context (Frontier_g1 and
// Frontier_g3_8c5891 outranking us):
//  - Both winners are Frontier siblings — same tactics, only tech
//    differs. The competition we're losing to is on the SAME painter
//    code, so the duel is decided by border swap math, which def
//    governs directly.
//  - Our offensive output already barely uses atk tech: tryKillAdjacent
//    has its own 1.4x ATTACKER_BONUS, and Spearhead leans on stack
//    momentum. Dropping atk 10 -> 0 should cost a sliver of marginal
//    kills while def 50 makes our front tiles meaningfully stickier
//    against PressureSink attrition and sibling Spearhead pushes.
//  - This is the cleanest hill-climb terminator: if rating stalls or
//    drops we know def 40 was the local optimum and the next descendant
//    walks back; if it climbs again, def is still under-shot.
export default {
  name: "Frontier_g4_ed149c",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with another 10 atk -> def: continue walking the def axis while Δ is still positive.",
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
