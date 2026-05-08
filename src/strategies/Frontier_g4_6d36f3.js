import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent inherited ATTACKER_BONUS=1.4 from when atk was 50
// (g0) and 30 (g1). That multiplier was tuned for a high-atk regime
// where most kill attempts genuinely succeeded. Now at atk=10/def=40,
// 1.4x is dangerously optimistic: tryKillAdjacent commits to kills it
// can't actually finish, wasting army strength against the very bots
// that beat us — Frontier_g1_ed1ff5 (atk 40, def 10) and
// Frontier_g1_0c6381 (atk 30, def 20). They have both more raw atk
// AND nonzero def, so our inflated kill-or-stay decisions are the
// worst kind of trade: we attack, fail, and then their stronger atk
// breaks our weakened tile. Drop ATTACKER_BONUS 1.4 → 1.15: still a
// modest commit-bias for the few kills atk-10 reliably wins, but
// stops sending paper-thin armies into atk-30+ neighbors. This pairs
// with the def-40 thesis — survive trades, only commit when we'll
// actually win them. If rating drops, the 1.4x was load-bearing for
// killing low-tech bots before they snowballed.
const ATTACKER_BONUS = 1.15;

export default {
  name: "Frontier_g4_6d36f3",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3 with ATTACKER_BONUS 1.4→1.15: stop committing failed kills now that atk is only 10.",
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
