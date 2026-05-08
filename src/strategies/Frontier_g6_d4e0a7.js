import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: tighten the kill-margin predicate. The parent inherits
// ATTACKER_BONUS=1.4 from g0 Frontier — but g0 ran atk:50, where the
// real attacker multiplier (engine 1.4 base * atk-tech bonus) is well
// above 1.4, so 1.4 was a conservative under-estimate and only winnable
// kills got attempted. At our atk:3, the atk-tech contribution is ~3%,
// so the real multiplier is ~1.44 — barely above the predicate. Any
// noise in the engine's combat resolution (stack interactions, partial
// attacks, the defender's def-tech) can flip a 1.4-margin kill from
// winnable to a losing trade.
//
// Four of the parent's last five losses were to atk-heavy bots
// (Frontier 50/50/0, Frontier_g1_ed1ff5 50/40/10, Frontier_g3_bd5683
// 40/20/40). Those opponents bring def:0–40 — exactly where our 1.4
// predicate is most likely to fire on near-tie kills that we then
// lose, bleeding front armies that we can't easily replace.
//
// Change: ATTACKER_BONUS 1.4 → 1.3. We require a fatter cushion before
// committing to a kill, so we skip the marginal trades and preserve
// front armies for the def-47 attrition fight we're actually built to
// win. If rating climbs, the parent really was over-attempting kills.
// If it drops, 1.4 was already calibrated and we should look at the
// interior-pump threshold or the FRONT branch next.
//
// Tech is inherited from the parent verbatim; only the kill predicate
// constant moves, so any rating delta is attributable to it.
const ATTACKER_BONUS = 1.3;

export default {
  name: "Frontier_g6_d4e0a7",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 3, def: 47 },
  description: "Frontier_g5 with ATTACKER_BONUS 1.4→1.3: at atk:3 the real multiplier is ~1.44, so 1.4 fires on near-tie kills; 1.3 skips the marginal trades and preserves front armies.",
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
