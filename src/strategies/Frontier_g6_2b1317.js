import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: ATTACKER_BONUS 1.4 was set when the lineage was atk-heavy
// (g0 ran atk 50). Tech has since walked all the way to atk 10 / def 40,
// but the kill-heuristic constant never moved. With atk 10, the
// per-army atk multiplier is tiny, so the 1.4 bonus is doing almost
// all the work to make tryKillAdjacent fire. That means a chunk of
// our kill attempts are barely-favorable trades that sometimes fail
// outright — and a failed kill attempt drains the source tile,
// breaking the interior pump and exposing the front.
//
// Three of the parent's five recent losses were long-ish games
// (534, 648, 623 ticks) where Frontier_g1_0c6381-style def-heavy
// cousins out-attritioned us. Those are exactly the matchups where
// shedding marginal kill attempts and keeping strength on the pump
// should compound.
//
// Single knob: ATTACKER_BONUS 1.4 → 1.25. Same painter, same tech,
// same Spearhead/SlowAndSteady fallbacks. If rating climbs, the kill
// heuristic was over-firing for our def-heavy posture; if it drops,
// the wide kill window was load-bearing and we walk back.
const ATTACKER_BONUS = 1.25;

export default {
  name: "Frontier_g6_2b1317",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Tighten kill heuristic 1.4 → 1.25 to match def-heavy tech and preserve pump strength.",
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
