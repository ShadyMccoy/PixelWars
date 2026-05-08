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

// Hypothesis: tech is locked at parent's 0/0/45/3/52 and the lineage
// gains have flattened. The remaining lever is logic. Parent's
// interior pump fires on `power > 0.5` — a gate that hasn't been
// touched since vanilla Frontier (atk:50). With our atk now at 3,
// `army.attackPower` per tick is much smaller in absolute terms, so
// 0.5 is barely a gate at all: interior tiles dribble out nearly every
// tick. That's a lot of micro-transfers, each paying whatever
// per-transfer overhead exists, in a lineage whose whole thesis is
// "stiffen the wall and win on attrition."
//
// Loss context: parent placed #2 in 5 long games (ticks 419–620). It
// survives — it just doesn't close. Closing in long games means
// landing decisive pushes at the front, not constant trickle.
//
// Change: raise the interior pump gate from 0.5 → 1.0. Same painter,
// same roles, same kill-or-stay, same Spearhead front behavior. The
// only diff is interior tiles bank a bit longer before pumping, so
// each pump is a whole-unit transfer instead of a fractional one. With
// prod:45, accumulation to 1.0 still happens fast; with def:52, each
// (now larger) pump arrives at a tile that holds it well.
//
// Read of the result:
//  - Rating ↑ vs parent: micro-pumps were noise; bigger batched pumps
//    feed the front more decisively. Next descendant can try 1.5.
//  - Rating ≈ parent: the gate doesn't matter at this prod level —
//    pivot back to tech (stack/move axes are still frozen).
//  - Rating ↓: 1.0 starves the supply chain; revert and try a smaller
//    bump like 0.75, or look for a different logic axis.
export default {
  name: "Frontier_g7_d953f4",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 45, atk: 3, def: 52 },
  description: "Frontier_g6_05514a with interior pump gate raised 0.5 → 1.0: batch interior pumps into whole-unit transfers to land decisive pushes in long attrition games.",
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
        if (power >= 1.0) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
