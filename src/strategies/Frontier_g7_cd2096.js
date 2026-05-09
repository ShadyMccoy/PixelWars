import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent's 1.4 -> 1.5 bump was a clear miss — rating
// dropped -164 (g5 1270 -> g6 1106). At this exact tech profile
// (atk 10 / def 40), the bots that beat the parent cluster on the
// OPPOSITE side: Frontier_g3_ae2a40 uses 1.2, Frontier_g4_a0e4f0
// uses 1.25. Both rationales are the same: at atk 10 our raw punch
// is weak, so a permissive ATTACKER_BONUS green-lights kill attempts
// the engine then loses, donating armies into a def-heavy enemy
// and bleeding the border. Parent's recent losses (4-of-5 #2 finishes
// in 528-656 tick mirrors) match the "wasted swings" failure mode
// rather than a "not closing" one — those long ticks aren't lack of
// aggression, they're attrition we're losing.
//
// One-knob change: ATTACKER_BONUS 1.5 -> 1.25. This isn't a small
// step, but the search has already mapped this axis: 1.2 and 1.25
// are proven winners at this tech, 1.5 is a proven loser, and the
// in-between (1.3-1.4) was the prior plateau. Jump directly into
// the known-good zone rather than tiptoe through the dead band.
//
// If rating climbs back near 1270 we've confirmed g6 was a detour
// and the 1.2-1.25 basin is real. If it overshoots (>1280) the
// next descendant can probe 1.15. If it underperforms 1.25's prior
// peers, then mirror-context (which winners faced) matters more
// than the constant and the next move shifts to the interior
// power>0.5 threshold or front-vs-interior role assignment.
//
// Tech is locked vs parent.
const ATTACKER_BONUS = 1.25;

export default {
  name: "Frontier_g7_cd2096",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g6_f29ac0 with ATTACKER_BONUS 1.5 -> 1.25: revert g6's bad bump and jump into the proven 1.2-1.25 winning zone for atk-10/def-40.",
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
