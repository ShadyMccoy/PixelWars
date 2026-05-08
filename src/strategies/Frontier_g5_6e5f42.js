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

// Hypothesis: parent (50/0/50) collapsed -165 vs g3. Sibling g5_705be5
// already tested the simple walk-back (atk 0→5, def 50→45) and beat
// the parent — so the kill-margin cliff at atk:0 is real, but that
// axis is being explored. Take a different small step on a frozen
// axis instead: pull 10 from prod into stack, keep atk:0/def:50.
//
// Why stack might compensate for the atk:0 cliff:
//  - Spearhead's value is stack momentum into the front. With atk:0,
//    individual kill checks under tryKillAdjacent's 1.4x bonus stop
//    closing on borderline tiles; the way to recover those kills
//    without spending def is to arrive with a bigger stack so the
//    base power before the 1.4x is already over the threshold.
//  - The losses against Frontier clones (g4_0585a4, g4_e4fec1,
//    g4_a9b303) all show same-architecture games decided on push
//    timing. Stack lets our front armies coalesce into larger units
//    before they crash into the seam, which is exactly the moment
//    those mirrors are won or lost.
//  - prod:40 still funds the engine; the marginal prod we're trading
//    away is the lowest-slope tile of a 50-prod build.
//
// Information value: this is the first non-zero stack in the lineage.
// If rating climbs, future descendants explore stack:20 and stack/move
// combos. If it drops, prod:50 is load-bearing and the 705be5 atk-axis
// walk-back is the right path forward.
export default {
  name: "Frontier_g5_6e5f42",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 0, def: 50 },
  description: "Frontier_g4 with 10 prod → stack: probe the frozen stack axis to recover kill-margin via Spearhead momentum.",
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
