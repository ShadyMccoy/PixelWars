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

// Hypothesis: the move axis has been frozen at 0 from g0 → g2 — totally
// unexplored, while siblings already probe atk→def further (g3_eaf9b1)
// and prod→def (g3_bd5683) and prod→stack (g3_69a9ba). The painter's
// whole thesis is interior tiles pumping strength toward the front via
// lowestDepthFriendlyNeighbor; that pump is exactly what move tech
// (garrison floor) gates. Parent's losses are close Frontier-vs-Frontier
// games (#2, #3, two #5s among Frontier variants) where the side that
// lands burst on the front first wins. Take 10 prod → move (now
// 10/0/40/20/30): keep def 30 intact so PressureSink attrition still
// doesn't bite, keep atk 20 so kill-or-stay still triggers via the 1.4x
// bonus, and let interior strength flow faster to where Spearhead can
// spend it. Prod 50→40 already shipped winning (Frontier_g2_461435 won
// at 40), so the donor is the safest knob to tap. If rating climbs,
// move is a real lever and worth exploring further; if it drops, the
// prod-50 throughput was load-bearing in this lineage.
export default {
  name: "Frontier_g3_66ca72",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 40, atk: 20, def: 30 },
  description: "Frontier_g2 with 10 prod → move: open the frozen move axis to speed interior→front strength flow.",
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
