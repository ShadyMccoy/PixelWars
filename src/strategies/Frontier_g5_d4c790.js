import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis (logic-only mutation; tech inherited verbatim from parent):
// Parent walked ATTACKER_BONUS 1.4 → 1.6 and rating cratered 1270 → 1107
// (-163). The two non-factory bots that beat the parent both moved the
// knob in the *opposite* direction: g6_9d691d at 1.25 and g3_ae2a40 at
// 1.2. That's strong evidence the 1.6 bump was wrong — at atk=10,
// inflating effective attack to ~16 still doesn't reliably finish kills,
// it just authorizes more marginal attempts that bleed our stack while
// def 40 borders are doing the actual scoring work.
//
// Don't just clone a known winner: bisect between the failed parent and
// the validated-conservative regime. Try 1.3 — half a step back from
// 1.6, and one notch above the 1.25 winner. If 1.3 outperforms parent,
// the direction is confirmed and we still have headroom; if it ties or
// loses to the 1.25/1.2 bots, the next descendant walks further down
// with confidence. If it somehow tops 1.25 too, then the local optimum
// sits between 1.25 and 1.4 and future generations should fine-tune
// there rather than pushing further out either way.
const ATTACKER_BONUS = 1.3;

export default {
  name: "Frontier_g5_d4c790",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g4_b918a6 with ATTACKER_BONUS 1.6 → 1.3: walk back the parent's bad bump toward the conservative regime that beat it.",
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
