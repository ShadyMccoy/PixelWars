import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent's losses are 4-of-5 #2 finishes in long
// Frontier-vs-Frontier mirrors (481-749 ticks). That pattern reads
// as "alive but not closing": def:40 keeps us standing, but the
// burst supplied by the 1.4x ATTACKER_BONUS isn't tipping enough
// adjacent-kill checks into actual kills against opponents who
// also sit on def 30-40. tryKillAdjacent only fires when the
// inflated power clears the target's defended army, so in mirrors
// the threshold itself is the binding constraint.
//
// One-knob change: ATTACKER_BONUS 1.4 -> 1.5. This converts the
// borderline "almost a kill" cases on contested front tiles into
// successful kills, which compounds because each successful
// tryKillAdjacent saves a Spearhead turn for follow-on push.
//
// Why not larger (1.6+): the bonus is a multiplier on declared
// attack power, so over-promising risks emptying tiles into kills
// that still fail. +0.1 is the smallest discriminating step on
// this axis (matches the lineage's habit of 10-unit walks on tech
// to stay revertable). If rating climbs, this axis is live and
// the next descendant can step again or explore a similar bias on
// the interior power>0.5 threshold. If it drops, we know 1.4 was
// the local optimum and offense isn't the bottleneck here.
//
// Tech is locked vs parent (lineage tech-search has flattened).
const ATTACKER_BONUS = 1.5;

export default {
  name: "Frontier_g6_f29ac0",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g5_ce16cd with ATTACKER_BONUS 1.4 -> 1.5: tip borderline mirror-match kills into successes.",
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
