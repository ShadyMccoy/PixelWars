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

// Hypothesis: parent's def-walk paid off (g0→g1→g2: +32 then +27).
// Sibling bd5683 already tested the obvious next step (prod 50→40 →
// def 40) and beat the parent. The other live signal is the frozen
// stack column: cousin g1_24609d (from vanilla Frontier) showed a
// 10-point stack probe was worth doing on lab1's maxArmy 12 cap —
// interior tiles with prod 50 likely clip the ceiling and waste
// growth before strength reaches the front. Probe stack here ON TOP
// of the proven def-heavy build instead of resetting atk like 24609d
// did. Pull 10 from prod (still dominant at 40) into stack; keep atk
// 20 (kill bonus 1.4x intact) and def 30 (the gain we just earned).
// If rating climbs, stack compounds with def; if it dips, we know the
// g2 prod headroom was load-bearing and bd5683's prod→def split was
// the better way to spend the same 10 points.
export default {
  name: "Frontier_g3_1d7ef8",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 20, def: 30 },
  description: "Frontier_g2 with 10 prod → stack: probe the frozen stack axis under lab1's maxArmy 12 cap while keeping the def gain.",
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
