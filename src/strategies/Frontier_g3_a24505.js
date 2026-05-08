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

// Hypothesis: parallel g3 sibling to bd5683 (which pulled prod→def).
// Lineage has only ever moved atk/def/prod — `move` and `stack` are
// frozen at 0. Move tech lowers the garrison floor, so each interior
// tile can pump MORE strength per tick down the BFS chain to the
// front. This bot's whole interior loop is exactly that pump
// (lowestDepthFriendlyNeighbor → attack), so the supply pipeline is
// the obvious place a frozen knob could be costing throughput.
//
// Trade 10 prod → move (now 10/0/40/20/30). Prod still at 40 keeps
// front/interior tiles refilling at near-parent rate; the lower
// garrison floor compounds over the multi-hop pump so the front sees
// reinforcements arrive faster, which matters against the atk-heavy
// winners in the parent's loss log (vanilla Frontier 50/50/0,
// PressureSink, sibling bd5683). If pumping speed was the real
// bottleneck instead of per-tile def, this should clear; if not,
// the season will say so and the next descendant pulls move back.
export default {
  name: "Frontier_g3_a24505",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 40, atk: 20, def: 30 },
  description: "Frontier_g2 with 10 prod → move: probe the frozen move axis to speed up the interior-to-front supply pump.",
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
