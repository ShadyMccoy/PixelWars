import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent (g6) bumped ATTACKER_BONUS 1.4 -> 1.5 and gained
// +73 rating, but the recent loss pattern is still long-tick mirror
// matches (e.g. seed=264 ticks=768, seed=289 ticks=667) finishing
// #2-#5. The kill criterion is now hot, but the interior supply
// chain that *feeds* those kills is unchanged: ROLE_INTERIOR tiles
// only pump toward the front when attackPower > 0.5. In tight mirror
// matches where everyone runs def=40, more total throughput to the
// border decides closing speed.
//
// Parent's comment explicitly flagged "the interior power>0.5
// threshold" as the next axis to probe. Take it: 0.5 -> 0.4. This
// lets tiles release reinforcements sooner — slightly smaller pumps,
// but more often — keeping the now-more-aggressive 1.5x kill branch
// supplied with army at the front. Lineage habit is small revertable
// steps (10-unit tech walks, 0.1 BONUS walks); 0.1 on this threshold
// matches that cadence.
//
// Why not lower (0.25 / 0.3): too-small pumps risk getting absorbed
// by enemy attacks before they consolidate at the border, and waste
// production cycles on tiles that haven't built meaningful army yet.
// 0.4 is the smallest discriminating step toward "feed the front
// faster" without crossing into thrashing.
//
// Why not raise (0.6+): would slow front replenishment further,
// directly fighting the offense bias the parent just established.
//
// If rating climbs, supply-rate is live and a future descendant can
// step again. If it drops, 0.5 was the local optimum and the
// bottleneck is elsewhere (Spearhead behavior, role assignment, etc).
//
// Tech locked vs parent (lineage tech-search has flattened).
const ATTACKER_BONUS = 1.5;
const INTERIOR_PUMP_THRESHOLD = 0.4;

export default {
  name: "Frontier_g7_8c89b0",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g6_f29ac0 with interior pump threshold 0.5 -> 0.4: feed the front faster to support the 1.5x kill branch.",
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
        if (power > INTERIOR_PUMP_THRESHOLD) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
