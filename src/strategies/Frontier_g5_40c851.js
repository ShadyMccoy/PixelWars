import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent kept the interior forwarding threshold at the
// historical `power > 0.5`, which lets every just-spawned interior
// tile dribble a fractional army forward each tick. With atk:10 we
// can't afford to feed the front in tiny crumbs — Frontier mirrors
// absorb them on the def:40 wall and we end up with attrition losses
// in 700-1164-tick grinds (every season-#277 loss was a long mirror
// game where we finished mid-pack).
//
// Raise the interior threshold from 0.5 → 1.0: interior tiles wait
// one extra production beat before forwarding, arriving as a full
// army's worth of force instead of a half. This pairs with the
// parent's permissive ATTACKER_BONUS=1.55 — a more aggressive kill
// rule is only useful if the support that arrives behind it can
// actually finish what the front opens up. Smaller, more discrete
// packets should produce cleaner local concentrations at the
// interior→front handoff and reduce the per-tick bleed that's
// costing us mirrors.
//
// Why 1.0 (not 1.5 or 2.0):
//  - 0.5 → 1.0 is the smallest meaningful step (one full army unit).
//  - 1.5+ would starve the front in early-game when interior tiles
//    haven't built up; we'd lose tempo against factory builds.
//  - 1.0 is the natural "send a real army, not a fragment" line.
//
// If rating climbs, future descendants should test 1.25-1.5. If it
// drops, the trickle-forward was load-bearing for keeping the front
// continuously fed and we revert.
const INTERIOR_FORWARD_MIN = 1.0;

const ATTACKER_BONUS = 1.55;

export default {
  name: "Frontier_g5_40c851",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g4_a920c5 with interior forward threshold 0.5→1.0: send full armies, not fragments, to the front.",
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
        if (power > INTERIOR_FORWARD_MIN) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
