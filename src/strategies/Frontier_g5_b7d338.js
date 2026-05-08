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

// Hypothesis: parent overshot on the def axis. Lineage Δs were
// +37, +28, +11 (slope clearly flattening) then -218 going from
// def 40 → 50 / atk 10 → 0. The crash says atk 0 actually does
// matter — losing the last sliver of attack tech tipped enough
// border exchanges to wreck offense, even with the 1.4 bonus and
// prod 50 covering most of the kill math.
//
// Disciplined walk-back: take the last 10 step back, atk 0 → 10,
// def 50 → 40. That's the g3 mix, which scored 1370 vs the
// parent's 1152. We're not innovating here — we're confirming
// def 40 is the local optimum on this axis before looking at a
// different knob (stack or prod) on a future descendant.
export default {
  name: "Frontier_g5_b7d338",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Walk back the over-extended def step: atk 0 → 10, def 50 → 40.",
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
