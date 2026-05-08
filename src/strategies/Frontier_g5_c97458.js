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
// Post-promotion search log (no successor promoted; documented so
// the next agent doesn't redo this work). All probes vs this bot,
// 21 mirrored seeds, ≥15 wins to promote:
//
//   probe                                       wins-losses   note
//   BONUS 1.7 → 1.8                             12-9          axis flattens past 1.7
//   T1 Concentrated Reinforcement                0-21         interior flow → max-pressure
//                                                             tile starves the rest of
//                                                             the line; ~250-tick collapse
//   T2 Coordinated Push (focus fire on weakest   11-10        def:50 absorbs concentration;
//      enemy frontier tile)                                   roughly neutral
//   T3 Border Thickening (depth=1 holds, depth>=2  0-21       ~280-tick collapse — the
//      flows)                                                 front needs continuous depth=1
//                                                             feed to survive
//   T4 Directional Land-Grab (pre-contact bias    10-11       Spearhead's stencil already
//      toward enemy centroid)                                 grows toward enemy; redundant
//   T5 Frugal Expansion (send 0.6× attackPower      0-21       weak claimed tiles get crushed
//      to empty tiles, keep source as launcher)              by parent's BONUS 1.7 on contact
//   T6 Counter-Momentum Hold (front holds when      7-14      stagnation: outgunned holds let
//      adjacent enemy unkillable)                            parent gain ground over time
//   T2 + BONUS 1.8 combo                          12-9        small positives don't compound
//
// Generalizations that should rule out future probes:
//  - Anything that touches interior FLOW collapses the line in <300
//    ticks (T1, T3, T5). Uniform lowest-depth flow is load-bearing.
//  - Anything that LOWERS front-tile strength loses fast (T5). The
//    parent's BONUS 1.7 punishes weak claims.
//  - Anything that REDUCES outward push at the front stagnates (T6).
//  - Concentrating offense on a single target tile is ~neutral (T2).
//  - Pre-contact directional changes are ~neutral (T4) because
//    Spearhead's rear-support kernel already biases toward the enemy.
//
// Where to look next:
//  - Tech change with ≥60 commitment to one axis (the user's allowed
//    exception): e.g. stack:60 with code that lets armies hold to
//    higher absolute strength before flowing. Different regime.
//  - Multi-tile coordination through game-level state (e.g. designate
//    one front tile per tick as "vanguard" with stronger commit
//    rules; orthogonal to T1's interior-flow target).
//  - Phase-aware front threshold: lower attack-out gate pre-contact
//    for land grab, higher post-contact for committed strikes —
//    structural rather than constant.
//  - Two-step planning: react to enemy adjacencies that are 2 tiles
//    away, not just 1. Engine API supports this via map.adjacent.
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
