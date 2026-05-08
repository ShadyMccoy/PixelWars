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

// Hypothesis: the def axis is showing diminishing returns in this
// chain (g1 +31, g2 +26, g3 +14), so a 4th step on the same axis
// (atk 10→0, def 40→50) is unlikely to pay and would also gut
// tryKillAdjacent (atk:0 leaves nothing to convert via the 1.4x
// attacker bonus). Meanwhile both winning g3 siblings that beat the
// parent at def:30 did it by opening the stack axis (stack 0→10,
// prod 50→40). They proved stack pays at def:30 — what's untested
// is whether stack ALSO pays on top of this parent's heavier def:40
// commitment.
//
// Why combining should compound:
//  - Parent's losses are still close #2 finishes vs other Frontier
//    variants and SINK-style attritioners. def:40 already buys late-
//    game survival against PressureSink-style sinks.
//  - Spearhead on FRONT tiles leans on stack momentum; a fatter
//    per-tile ceiling lets the supply chain deliver bigger pulses,
//    which is the lever that flips close Frontier-vs-Frontier games.
//  - prod 50→40 is the same shave the winning siblings absorbed
//    without losing the SlowAndSteady interior pump.
//
// Keep atk:10 (don't disturb the def-axis progress) — only move the
// 10 prod points to stack. If rating climbs, stack pairs well with
// our heavier def base. If it drops, def:40 was tightly coupled to
// prod:50 and stack belongs at a lighter-def base.
export default {
  name: "Frontier_g4_be69df",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Frontier_g3_eaf9b1 with prod 50→40, stack 0→10: stack the def-40 base with the stack-axis opening that worked for sibling g3 winners.",
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
