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

// Hypothesis: parent (g4_0585a4) at {prod:50, atk:0, def:50} regressed
// -172 vs its g3 parent. The atk→0 step over-shot — losses included
// being out-attritioned by other Frontier siblings and PressureSink-
// style sustained-pressure variants. But sibling g5_e3c10c (which
// explored stack from a similar 0/0/50 baseline) beat us, and sibling
// g4_0542d0 kept atk:10 and won. Both signals say the def-50 plateau
// is fine; what isn't fine is leaving the OTHER zero-cost knob (move)
// completely unexplored across the whole lineage.
//
// Move (garrison floor) is the only knob that's been frozen at 0 for
// the entire g0..g4 chain. e3c10c probed stack and it paid; this is
// the parallel probe on move from the same kind of baseline. Pulling
// 10 from prod (not def) because:
//   - def 50 just paid in the e3c10c lineage; don't unwind the
//     variable most likely producing wins.
//   - prod has been frozen at 50 forever; same "frozen ≠ ruled out"
//     argument that justified the stack probe applies to prod too.
//   - keeping atk:0 holds e3c10c's known-good baseline so this run
//     isolates the move-axis effect rather than confounding it with
//     a simultaneous atk walk-back.
//
// One-knob change vs e3c10c's playbook: stack 10 → move 10. Everything
// else matches the winning g5_e3c10c shape so we can read the move
// signal cleanly. If rating rises, move is alive and the next step is
// move 10→20. If it drops, move is dead and the next descendant
// should walk atk back to 10 instead.
export default {
  name: "Frontier_g5_9e31b8",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 40, atk: 0, def: 50 },
  description: "Frontier_g4_0585a4 pivot to move axis: prod 50→40, move 0→10. First probe of move (only knob frozen across entire lineage).",
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
