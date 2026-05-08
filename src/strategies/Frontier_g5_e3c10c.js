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

// Hypothesis: parent g4 (atk 0 / def 50) jumped +1003, validating the
// whole atk→def axis end-to-end. Per the parent's own exit note, the
// next move should pivot to a fresh axis (stack/move).
//
// Picking stack first because:
//  - The parent's own commentary already flagged that tryKillAdjacent
//    and Spearhead "lean on ATTACKER_BONUS=1.4 and on stack momentum /
//    attackPower". Our offense path runs through both helpers, so any
//    stack uplift compounds with ATTACKER_BONUS on every kill attempt.
//  - prod has been frozen at 50 across the entire lineage (g0..g4).
//    "Frozen ≠ ruled out" — pulling 10 off prod is the cheapest way
//    to find out whether prod 50 was load-bearing or just inertia.
//  - def stays at 50 because it just paid +1003 and we don't want to
//    confound the stack probe by also unwinding the variable that
//    most likely produced the jump.
//  - move stays at 0 for now; if stack pays we explore move next, if
//    stack doesn't pay we'll try move from this same baseline.
//
// One-knob change: prod 50→40, stack 0→10. Everything else identical.
export default {
  name: "Frontier_g5_e3c10c",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 0, def: 50 },
  description: "Frontier_g4_a58a75 pivot: prod 50→40, stack 0→10. First probe of stack axis after atk→def axis topped out.",
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
