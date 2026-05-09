import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent kept the 1.5 ATTACKER_BONUS bump (a proven +30
// rating step) but still loses long attrition games — s294 ticks=857
// finished #6, s249 ticks=872 #3. Those long Frontier-mirror games
// are throughput-bound: the front holds, but interior supply isn't
// reaching the spearhead fast enough, so def:40 just keeps us alive
// while a cousin closes.
//
// Cousin Frontier_g4_5ef171 already proved that lowering the
// interior relay threshold 0.5 -> 0.25 wins on this lineage (it
// beat the parent in s294 ticks=857 — the exact long-game pattern
// we're trying to fix). That single knob has never been combined
// with the parent's 1.5 ATTACKER_BONUS — they're orthogonal: one
// bumps borderline kills on the front, the other keeps the supply
// chain feeding the front instead of dropping into SlowAndSteady's
// scatter when interior power dips below 0.5.
//
// One-knob change from parent: INTERIOR_RELAY_MIN 0.5 -> 0.25.
// Tech is locked at parent 50/10/40. ATTACKER_BONUS stays at 1.5.
// If rating climbs, the two effects compound and we keep both. If
// rating drops, the relay attacks below 0.5 are wasting more than
// they relay at this offense level, and the next descendant should
// walk the threshold back up (try 0.4) rather than touch a third
// axis.
const ATTACKER_BONUS = 1.5;
const INTERIOR_RELAY_MIN = 0.25;

export default {
  name: "Frontier_g7_b6ba06",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g6_f29ac0 with INTERIOR_RELAY_MIN 0.5 -> 0.25: keep parent's 1.5 attacker bonus and add the proven g4_5ef171 supply-throughput tweak on top.",
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
        if (power > INTERIOR_RELAY_MIN) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
