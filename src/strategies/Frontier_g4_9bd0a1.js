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

// Hypothesis: the def-axis walk is showing diminishing returns
// (g1 +30, g2 +24, g3 +16) — each step pays less, so a fourth
// atk→def step (10→0, 40→50) is the highest-risk continuation
// (atk:0 also kills the kill-or-stay math). Meanwhile sibling
// g3_ad3d81 took 10 prod → stack from the g2 base and beat the
// parent, which is direct evidence the stack axis pays.
//
// Combine the two signals: keep the parent's def:40 advantage
// against PressureSink/Frontier attrition, and add the stack:10
// pulse-fattening that worked for the sibling. One knob moves
// from the parent: prod 50→40, stack 0→10. Atk and def are held.
//
// Why this should help against the loss context:
//  - Losses #1, #3, #5 were to other Frontier variants in long
//    games — exactly the regime where a fatter supply-chain stack
//    ceiling should compound, since FRONT tiles stay above the
//    0.5 power floor longer between Spearhead pushes.
//  - Loss #4 to a factory-gen Frontier_g5 ran 871 ticks; that's
//    the same long-game profile.
//  - prod:40 still matches vanilla Frontier's pump rate, so we
//    don't starve the chain — we just trade some over-saturated
//    prod for an axis we know pays.
// If rating climbs, stack stacks (pun) with our def advantage.
// If it drops, prod:50 was load-bearing and we walk back.
export default {
  name: "Frontier_g4_9bd0a1",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Frontier_g3_eaf9b1 with 10 prod → stack: combine our def:40 edge with the stack pulse that worked for sibling g3_ad3d81.",
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
