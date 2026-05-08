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

// Hypothesis: the cousins that beat the parent walked the def axis
// (g3_eaf9b1: atk→def) and the stack axis (g2_ddb046: atk→stack). The
// remaining wholly unexplored axis in this lineage is `move` — the
// garrison floor. The whole Frontier playbook is a supply pump:
// interior tiles repeatedly attack their own lowest-depth neighbor to
// shovel strength toward the front. Each of those internal hops leaks
// strength to the source tile's residual; a higher move (garrison
// floor) means *more* strength stays put when armies depart, which on
// the surface sounds like a brake on the pump.
//
// But the same garrison floor also means our own front and sink tiles
// don't bleed empty when we push outward at the seam — exactly the
// failure mode against PressureSink, where a thin border tile gets
// flipped after we attack out of it. Atk gains are partly redundant
// with the 1.4x ATTACKER_BONUS already applied in tryKillAdjacent, so
// shaving 10 atk costs us little on confirmed-kill swings.
//
// Take 10 from atk and put it in move: atk 30→20, move 0→10, keep prod
// 50, def 20, stack 0. Tiny step, first datapoint on a totally frozen
// axis. If rating climbs the pump was leaking residual at the seam; if
// it drops we know move ≤ 10 is dominated by atk and we walk back.
export default {
  name: "Frontier_g2_38bfff",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 50, atk: 20, def: 20 },
  description: "Frontier g2: 10 atk → 10 move to probe the unexplored garrison-floor axis.",
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
