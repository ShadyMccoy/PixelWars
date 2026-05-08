import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: tech axis is exhausted (parent's +2 over g2 is noise),
// so the next gain has to come from the act() logic. The one constant
// every Frontier ancestor inherited unchanged is ATTACKER_BONUS = 1.4
// in tryKillAdjacent. That number was set when the lineage ran atk 50;
// the parent now runs atk 10 — five times weaker — yet we still tell
// the kill probe to assume our attack lands ~40% harder than nominal.
// At atk 10, that overconfidence likely converts into attempted kills
// that don't actually clear the target, leaving our army committed and
// out of position for the next tick. Most parent losses are #2 finishes
// in long, attritional games against other Frontier variants — exactly
// the regime where wasted near-miss kill attempts compound.
//
// One-line change: drop ATTACKER_BONUS 1.4 → 1.1. We still take the
// gimme kills (target sized for the bonus we actually have at atk 10)
// but we stop committing to marginal attacks that need a phantom 40%
// boost to succeed. Tech is inherited verbatim from the parent so the
// only signal in the rating delta is this kill-threshold change.
const ATTACKER_BONUS = 1.1;

export default {
  name: "Frontier_g4_c08ff4",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3 with ATTACKER_BONUS 1.4→1.1: stop overcommitting to marginal kills now that atk has walked down to 10.",
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
