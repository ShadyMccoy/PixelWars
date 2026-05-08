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

// Hypothesis: the def axis has been winning with accelerating returns
// (g1→g2: +10, g2→g3: +35). Each 10-point shift atk→def has been net
// positive, so take one more step of the same size: atk 10→0, def 40→50.
//
// Why we expect this to keep paying:
//  - Loss context still includes PressureSink (s345) and a Frontier_g2
//    (s356). Both scenarios reward def — PressureSink farms attrition
//    on our border, and Frontier_g2 itself runs def:10 vs the vanilla
//    50/50, which is the same insight one step earlier in our lineage.
//  - Offensive output on this bot is dominated by ATTACKER_BONUS=1.4
//    (the kill-adjacent inflator) and prod=50 (which keeps the Spearhead
//    supply pump full). Raw `atk` tech is the smallest lever in this
//    architecture; stripping the last 10 points should barely move
//    which kills succeed in tryKillAdjacent.
//  - Same step size as before: if rating drops, def 40 was the local
//    optimum and we walk back to atk 10. If rating climbs, def 50 is
//    the next floor and we explore stack/move from a stronger base.
export default {
  name: "Frontier_g4_95721f",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with another 10 atk → def: keep walking the def axis after the +35 jump.",
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
