import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis (logic-only mutation; tech inherited verbatim):
// The lineage has spent 5+ generations mining ATTACKER_BONUS — every
// winner that beat the parent (b918a6=1.6, 6d36f3=1.15, 9d691d=1.25)
// moved THAT knob, and parent's 1.55 sits in a band that's been hit
// from both sides. 1087 rating vs g3's 1270 says we're chasing a
// noisy local optimum on that axis. Time to mutate a different lever.
//
// The interior pump uses `power > 0.5` to gate forward-flow toward
// the border. With prod=50 (fast accumulation) and atk=10 (each unit
// of stack contributes little damage), a 0.5-threshold means deep
// interior stack ships dribbles forward at half-charge — by the time
// they reach a ROLE_FRONT tile feeding Spearhead, individual moves
// are too small to flip swing tiles on a wrap 30x22 lab1 where
// border contact is constant. Raising 0.5 → 0.7 lets each interior
// hop consolidate more stack before forwarding, so Spearhead receives
// fuller armies less frequently rather than weak armies more often.
// The def=40 stiffness makes the wait safe: tiles holding stack a
// few extra ticks won't get popped, and the parent's losses (5×
// close #2/#3/#4 finishes against Frontier cousins) are exactly the
// "lost on margins" pattern that bigger discrete punches at the
// front should help. ATTACKER_BONUS stays at 1.55 — we are NOT
// re-tuning that axis this generation.
//
// If rating climbs, the pump was under-consolidating and the lineage
// has a second axis worth walking; if it drops, 0.5 was load-bearing
// for keeping the front fed and future descendants leave it alone.
const ATTACKER_BONUS = 1.55;
const INTERIOR_PUMP_MIN = 0.7;

export default {
  name: "Frontier_g5_1755c0",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g4_b636c3 with interior pump threshold 0.5 → 0.7: consolidate stack into bigger forward hops instead of half-charged dribbles.",
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
        if (power > INTERIOR_PUMP_MIN) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
