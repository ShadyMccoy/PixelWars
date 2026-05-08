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

// Hypothesis: parent (prod 50 / atk 20 / def 30) climbed +17 by walking
// def. The obvious next step on the def axis (prod 40 → def 40) was
// already taken by cousin Frontier_g3_bd5683, so re-walking it is
// redundant. Meanwhile stack is the only fully-unexplored axis on this
// branch (frozen at 0 g0→g2), and a sibling that did invest in it —
// Frontier_g2_ddb046 (stack 10) — actually beat the parent in season
// #170 (seeds 374 and 365 both featured ddb046 finishing ahead).
//
// Try prod 50 → 40, stack 0 → 10, keeping atk 20 / def 30 intact. The
// painter's interior-to-front supply pump repeatedly attacks own tiles
// to shovel strength forward; stack tech raises how much effective army
// accumulates per tile along that chain. On lab1's 30×22 wrap map the
// supply path is long, so the pump is where stack should pay. Prod
// drop from 50→40 is a 10-point dip on output, but the parent already
// shows def matters more than raw production at this margin, and we're
// preserving the def 30 that earned the +17. If rating climbs we know
// the bottleneck was the pump, not border thickness; if it dips, stack
// is dead on this build and the next descendant can try move instead.
export default {
  name: "Frontier_g3_ca36f8",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 20, def: 30 },
  description: "Frontier_g2 with 10 prod → 10 stack: probe the unexplored stack axis while keeping def 30.",
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
