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

// Hypothesis: parent (atk 0 / def 50) cratered to 1194 from g3's 1370,
// but two functionally-identical siblings (a58a75 and 2ee563, both
// 0/50) beat the parent — that means 0/50 isn't broken, the parent
// just rolled poorly. The atk→def axis is saturated though (we're
// pinned at the def 50 ceiling), so per the parent's own decision
// rule we should pivot to a fresh axis.
//
// Move and stack have been frozen at 0 across the entire lineage —
// genuinely unexplored. Sibling g4_0542d0 won by pulling 10 prod →
// def (prod 40 / atk 10 / def 50), proving prod 40 is still enough to
// keep the supply pump alive. Take the same 10 from prod, but route
// it to stack instead: prod 40 / stack 10 / atk 0 / def 50.
//
// Why stack and not move:
//  - The hottest combat path on this bot is Spearhead.act on FRONT
//    tiles, which wins via stack momentum (rear support pushing
//    through a chained attack). Stack tech directly multiplies that
//    column-attack output, which is exactly the lever Spearhead
//    leans on.
//  - PressureSink (the recurring loss in this lineage) is sustained
//    border attrition; stack lets a single front tile convert built-
//    up rear garrison into a bigger pushed packet, which is more
//    efficient against a sink than spreading the same supply.
//  - Move (garrison floor) gates how often armies can move at all —
//    a bigger leap. Stack is the smaller, more reviewable first
//    poke at the unexplored axis.
//
// If rating climbs, stack is alive and the next descendant pulls
// more into it. If it drops or stays flat, we know stack 10 wasn't
// the leak and the next pivot tries move instead.
export default {
  name: "Frontier_g5_874469",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 0, def: 50 },
  description: "Frontier_g4 pivot: pull 10 prod → stack to amplify Spearhead's column-attack momentum (40/10s/0a/50d).",
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
