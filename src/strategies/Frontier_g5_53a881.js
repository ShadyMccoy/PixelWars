import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent jumped 1.4 -> 1.55 and rated 1295 (+78). But the
// season #275 evidence is that EVERY bot which beat the parent sits
// at a LOWER ATTACKER_BONUS than parent at this exact tech (atk:10
// def:40):
//   - Frontier_g4_689cfb : 1.30
//   - Frontier_g3_61b131 : 1.40
//   - Frontier_g7_cd2096 : 1.25
// And g7_cd2096's own commentary documents that 1.5+ is a "loser
// zone" at atk:10 because permissive bonuses green-light attacks the
// weak raw punch can't actually convert, donating armies to def:40
// mirrors. Parent's losses (4 of 5 are tight #2 / mid-pack finishes
// in 500-1000 tick Frontier mirrors) match the "wasted swings"
// pattern more than a "not aggressive enough" one.
//
// The +78 that parent posted at 1.55 was probably real — the s250
// field that produced it was different from the current s275 field —
// but at THIS field, every direct comparator at parent's tech wins
// with a tighter trigger. So step the knob back toward the proven
// zone, but only one calibrated notch (1.55 -> 1.45). Reasons for
// not going to 1.40 directly:
//  - 1.40 is g3_61b131 — replicating it gives no new information.
//  - The 1.40-1.55 band is otherwise unexplored at this tech; if the
//    true peak sits in there, 1.45 finds it.
//  - If 1.45 still loses, the next descendant has a clear gradient
//    to follow (keep stepping down toward 1.30-1.40).
//  - If 1.45 wins, we've identified a new local optimum above the
//    1.25-1.40 cluster and future moves probe 1.42-1.48.
//
// Tech is inherited verbatim from parent — the lineage flattened on
// the tech axis (g3 +1, g4 +78 came from the bonus knob, not tech),
// so this descendant tests the act() lever only.
const ATTACKER_BONUS = 1.45;

export default {
  name: "Frontier_g5_53a881",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g4_a920c5 with ATTACKER_BONUS 1.55 -> 1.45: step one notch back toward the proven 1.25-1.40 winning zone at atk:10/def:40, probing the unexplored 1.40-1.55 gap.",
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
