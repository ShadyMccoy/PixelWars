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

// Hypothesis: parent g1_0c6381 (+34 vs vanilla) proved def helps borders.
// Sibling explorations have already covered prod→stack (g3_69a9ba) and
// atk→stack (g2_ddb046). The ENTIRE Frontier lineage has frozen move
// at 0 from g0 through every winning descendant — it is the single
// axis with zero data points, so a step here is maximally informative.
//
// Move tech raises the garrison floor: tiles retain more strength
// passively. Two reasons this should compose with the parent's design:
//  1. The painter splits roles into FRONT/INTERIOR. Interior tiles
//     pump strength forward via lowestDepthFriendlyNeighbor; a higher
//     garrison floor means the *next* tile in the chain holds more
//     when it gets the handoff, reducing leakage along the long
//     supply paths on lab1 (30×22, wrap).
//  2. Against PressureSink-style attrition, garrison floor helps the
//     same way def does but on the un-attacked turns — it preserves
//     mass between hits rather than just absorbing them harder.
//
// Pull 10 from atk → move (atk 30→20, move 0→10). Atk loss is cheap
// because tryKillAdjacent already gives a 1.4x attacker multiplier;
// most kill swings the parent wins still succeed at atk 20. Keep def
// 20 intact since it was the source of the parent's gain. If rating
// climbs, move is worth deeper exploration across the whole family.
// If it drops, we've confirmed move is a dead axis for Frontier.
export default {
  name: "Frontier_g2_3e007c",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 50, atk: 20, def: 20 },
  description: "Frontier g1_0c6381 with 10 atk → 10 move: probe the lineage's untouched move axis to reduce supply-chain leakage and harden idle tiles.",
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
