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

// Hypothesis: parent's atk 10→0 step crashed -175 (1370→1195). Both bots
// that beat the parent in the recent loss list and reverted that move
// (Frontier_g4_f847e1 and Frontier_g4_a9b303, both 40/10/50) confirm the
// def-from-atk walk overshot — atk:0 broke tryKillAdjacent / Spearhead
// kill math against atk-heavy opponents (Frontier_g2_bd2a33 winning a
// loss-context game is the smoking gun: bd2a33 runs atk:30 and farmed us).
//
// Per the parent's own rule ("if rating drops, walk back / try a different
// axis"), do BOTH: walk back to atk:10 and probe the unexplored stack axis.
// Stack has been frozen at 0 across the whole lineage but sibling
// Frontier_g2_bd2a33 already validated 10 stack as a real lever for the
// interior→front supply pump on this 30×22 lab1 map (it's beating us
// outright). Treat g3_eaf9b1 (50/0/0/10/40, +46) as the baseline rather
// than the broken parent, and apply one small change from there:
// take 10 from prod and put it in stack.
//
// Net tech: { move 0, stack 10, prod 40, atk 10, def 40 }.
//  - atk:10 restored: tryKillAdjacent kill math is back to known-good.
//  - def:40 held: g3's proven border thickness against PressureSink/
//    Frontier-clone attrition; we don't double-bet def on the same recovery.
//  - prod 50→40: same cut sibling g4_a9b303 made successfully (it beat
//    the parent), so this prod level is independently validated.
//  - stack 0→10: the actual probe. Each interior pump now moves more
//    usable strength toward the front, which is exactly the bottleneck
//    when def-heavy bots stack up at the painter border.
//
// If rating climbs, stack is alive in this shell and we walk it again.
// If it sags, the prod cut was load-bearing and we should pull stack
// from def or atk on the next step.
export default {
  name: "Frontier_g5_10d84e",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Recovery from g4_0585a4 atk:0 crash: revert to validated atk:10 floor and probe the unexplored stack axis (10 prod → stack).",
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
