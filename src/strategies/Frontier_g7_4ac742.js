import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent's own roadmap flagged two next axes after the
// 1.4 -> 1.5 ATTACKER_BONUS step: bump the bonus again, OR "explore
// a similar bias on the interior power>0.5 threshold". The 1.55
// variant is already validated by Frontier_g4_a920c5 (it beat the
// parent), so re-stepping that knob gives redundant signal. The
// interior threshold is the untouched lever.
//
// Parent's losses are 4-of-5 long mirror grinds (538, 560, 591, 602,
// 957 ticks). In games that long, interior tiles accumulate small
// armies repeatedly; the 0.5 cutoff means anything below half
// attackPower just sits and decays toward maxArmy=12 instead of
// feeding the front. Each unfed interior tick is growth that never
// reaches Spearhead, and on a 30x22 wrap map the supply path can be
// 4-6 hops, so even a few skipped feeds per army compound.
//
// One-knob change: INTERIOR_POWER_THRESHOLD 0.5 -> 0.3. This lets
// modestly-built interior tiles push depth-ward earlier instead of
// stalling, which should:
//  - thicken front replenishment in long mirrors (the exact loss
//    context above) without spending tech,
//  - keep the kill-margin upgrade from g6 intact (ATTACKER_BONUS
//    stays at 1.5; this descendant isolates the threshold change so
//    we can attribute any rating delta cleanly).
//
// Why 0.3 (not 0.25 or 0.4):
//  - 0.4 is a token nudge; over a 700-900 tick game the number of
//    interior tiles flipped from "stall" to "feed" would be tiny.
//  - 0.25 is essentially "always feed" — risks dribble attacks where
//    1-army tiles charge forward and die, fragmenting the supply.
//  - 0.3 catches the bulk of mid-strength interior tiles while still
//    gating the smallest ones from suicidal pushes. A meaningful
//    discriminating step on this axis.
//
// If rating climbs: interior under-feeding was a real bottleneck in
// long mirrors and the next descendant can step further (0.3 -> 0.2)
// or pair with an ATTACKER_BONUS bump. If rating drops: 0.5 was
// load-bearing — small interior armies need to consolidate rather
// than push, and we revert and try a different axis.
//
// Tech is locked vs parent (lineage tech-search has flattened).
const ATTACKER_BONUS = 1.5;
const INTERIOR_POWER_THRESHOLD = 0.3;

export default {
  name: "Frontier_g7_4ac742",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g6_f29ac0 with INTERIOR_POWER_THRESHOLD 0.5 -> 0.3: thicken front replenishment in long mirror grinds.",
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
        if (power > INTERIOR_POWER_THRESHOLD) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
