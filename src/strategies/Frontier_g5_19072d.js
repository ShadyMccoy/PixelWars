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

// Hypothesis: the def axis bottomed out. Lineage Δ vs parent was
// +37, +28, +11, then -204 at def 50. The shrinking Δ already hinted
// the slope was flattening; g4 confirms def 50 is past the wall.
//
// One small step: walk def back to 40 (the previous best), and put
// the freed 10 points into stack — a wholly unexplored axis from
// this branch. Front-line behavior here IS Spearhead, which the
// parent's own comment notes "leans on stack momentum"; if stack
// tech meaningfully boosts Spearhead's pushes, this is exactly the
// front-line buff the def-50 ceiling told us we needed.
//
// Why this should pay vs the season #213 loss (placed #6 in an
// all-Frontier-sibling lineup): same painter code on every bot, so
// duels are decided on the front. def 40 was already proven to keep
// front tiles sticky; adding stack on top targets the missing
// offensive lever without re-opening the failed atk axis.
//
// Step is intentionally minimal (one knob walk-back + 10 into a new
// axis) so the season gives a clean read on stack's slope.
export default {
  name: "Frontier_g5_19072d",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 0, def: 40 },
  description: "Walk def 50->40 (g4 hit the wall) and probe stack 0->10 to feed Spearhead's front pushes.",
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
