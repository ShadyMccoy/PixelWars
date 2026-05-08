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

// Hypothesis: keep walking the def axis the parent opened. Parent
// (g1) went 50/0 → 40/10 (atk/def) and gained +27 rating, validating
// the first step. A parallel branch reached atk 20 / def 30
// (Frontier_g2_34255e) and beats this parent in seasons #157 and
// #184 — so the def-favorable region is real, not noise. Take the
// natural next step toward it: atk 40→30, def 10→20.
//  - tryKillAdjacent still has the 1.4x ATTACKER_BONUS, so atk 30
//    keeps the kill-or-stay math healthy on adjacent enemies.
//  - prod stays at 50 (dominant axis untouched), so interior pumping
//    speed is unchanged.
//  - +10 def directly addresses the loss profile: 4/5 recent losses
//    were ticks 450–812 grinds against bots that won by sustaining
//    border pressure (Frontier_g2_34255e, Frontier_g3_eaf9b1,
//    PressureSink in lineup, vanilla Frontier descendants). Stiffer
//    border tiles bleed less per exchange in those long fights.
// If the rating climbs, the next descendant should keep walking
// toward 20/30. If it drops, we've overshot the local optimum and
// should explore stack from the 40/10 baseline instead.
export default {
  name: "Frontier_g2_813934",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 30, def: 20 },
  description: "Frontier_g1_ed1ff5 with another 10 atk → def: keep walking the def axis a parallel branch already validated at 20/30.",
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
