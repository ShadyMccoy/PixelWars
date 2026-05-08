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

// Hypothesis: parent (g1) holds 50 prod / 30 atk / 20 def with stack
// frozen at 0. The lineage's biggest validated breakthrough so far is
// def (g1→g2 atk→def gave +215), but a stack push later (g3→g4) also
// paid +43, suggesting stack is alive in this archetype too. Most of
// the parent's recent losses run long (713, 715, 686 ticks) and many
// are mirror matches against Frontier siblings — exactly the regime
// where INTERIOR pulses arriving in fatter chunks at FRONT keep
// Spearhead pushes above the 0.5 attackPower floor more consistently.
//
// Probe stack early with a single 10-point shift from prod → stack.
// Prod stays at 40 (above vanilla-baseline-minus-10, still well over
// the production floor); atk and def are unchanged so we don't muddle
// the def signal that the sibling g2 is exploring. If rating climbs,
// stack at this gen is undervalued and future descendants can keep
// pushing it; if it dips or flattens, the def axis is the only live
// one at g1 and stack only matters once def is satisfied.
export default {
  name: "Frontier_g2_cadf18",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 30, def: 20 },
  description: "Frontier_g1 with 10 prod → stack: probe whether stack is live at this gen, or only after def is built up.",
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
