import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// First descendant produced by the 1v1-evolution loop (vs. fixed
// incumbent Frontier_g4_a58a75; promote on >= 15 of 21 mirrored-slot
// duels; tech frozen at parent's allocation; code-only changes).
//
// Search history against the parent (each row = one challenger, all
// run on lab1 with seeds 1..21 alternating slots):
//
//   probe                                     wins-losses   note
//   BONUS 1.4 → 1.6                           12-9          edge, no promote
//   BONUS 1.4, threshold 0.5 → 0.3            8-13          dilution hurts
//   BONUS 1.6, threshold 0.5 → 0.6            14-7          one shy of bar
//   BONUS 1.7, threshold 0.6   (this bot)     15-6          promotes
//
// Hypothesis (confirmed). The parent's 1.4 attacker bonus left
// "almost winnable" adjacencies on the table; the def:50 garrison
// floor cushioned the source tile against counter-attack even at
// higher bonus values, so each step from 1.4 → 1.7 converted more
// frontier flips with no observed bait-kill blowback. Independently,
// raising the interior reinforcement threshold from 0.5 to 0.6
// shipped slightly thicker waves at the cost of slightly fewer
// flows — a net positive when paired with the more aggressive kill
// rule (the +3 wins from 1.4→1.6 bonus jumped to +7 wins once the
// flow knob was retuned to match).
//
// Next probe (for whoever inherits this loop): 1.7 may not be the
// cap on the bonus axis — try 1.8. If 1.8 also promotes, the axis
// is monotonic in this regime and the probe after that should pivot
// to a structural change (phase-aware behavior, or a ROLE_SINK rule
// for the contact line). If 1.8 fails, 1.7 is a local optimum and
// the next change should be elsewhere.
const ATTACKER_BONUS = 1.7;
const INTERIOR_FLOW_THRESHOLD = 0.6;

export default {
  name: "Frontier_g5_c97458",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g4_a58a75 with BONUS 1.4→1.7 + interior threshold 0.5→0.6: more aggressive kills + thicker reinforcements. 15-6 vs parent in 21 mirrored 1v1s.",
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
        if (power > INTERIOR_FLOW_THRESHOLD) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
