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

// Hypothesis: def axis is still the live one. Lineage trajectory:
// g0(0)→g1(20)→g2(30)→g3(40) gave +24/+24/+21 — diminishing but still
// positive. The obvious next step (atk 10→0, def 40→50) zeros out atk
// and risks the tryKillAdjacent path — Spearhead leans on stack
// momentum but the kill branch still benefits from base atk under the
// 1.4x bonus. So instead of draining atk, pull from prod, the same
// move sibling Frontier_g3_bd5683 made when it beat our parent.
//
// Result: prod 50→40, atk stays at 10 (preserving kill power against
// PressureSink/Frontier-50/50/0 matchups in the loss list), def 40→50.
// Sibling bd5683 confirmed prod→def is positive at the (40/20/40)
// allocation; this combines the parent's atk-axis gains with that
// prod-donor step. If rating drops we know def 40 was the saturation
// point and the next descendant should explore stack/move instead.
export default {
  name: "Frontier_g4_340f64",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 10, def: 50 },
  description: "Frontier_g3 with 10 prod → def (now 40/10/50): keep climbing def via prod donor, preserve atk for kill bonus.",
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
