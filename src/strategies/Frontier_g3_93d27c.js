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

// Hypothesis: the def axis is being thoroughly explored by siblings
// (g3_8c5891 pushed atk back up, g3_bd5683 took 10 prod → def). Both
// of those beat the parent. The g0→g2 chain has kept move:0 stack:0
// frozen the whole time — the bd5683 comment even flagged stack/move
// as the next unexplored direction. Parent's losses include two
// PressureSink variants and a high-def Frontier (bd5683); all of them
// sustain pressure across many tiles, and our atk is already thin at
// 20. Pulling more from atk or prod risks hitting a known wall.
//
// Try the unexplored axis instead: shift 10 prod → stack
// (50→40 prod, 0→10 stack). Stack rewards keeping multiple armies on
// the same tile, which should let interior pump tiles aggregate
// strength before delivering it to the FRONT — directly addressing the
// "we get out-pressured along the seam" failure mode without nerfing
// kill power (atk stays 20) or border survival (def stays 30). If
// rating climbs, stack is live and the next descendant can keep
// walking it; if it drops or flats, we know the prod cut hurt more
// than stack helped and we should pull from a different source.
export default {
  name: "Frontier_g3_93d27c",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 20, def: 30 },
  description: "Frontier_g2 with 10 prod → stack: open the frozen stack axis without touching atk/def.",
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
