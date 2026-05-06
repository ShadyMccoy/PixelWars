import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import { balanceAttack } from "./helpers.js";
import {
  paintPressureSink,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
  ROLE_SINK,
} from "./painter.js";

const ATTACKER_BONUS = 1.4;
const PRESSURE_CUTOFF = 0.5;

export default {
  name: "PressureSink",
  author: "shady",
  version: 1,
  description: "Painter-based: attack low-pressure border tiles, brace high-pressure ones, gradient flow toward attack fronts.",
  summary: `Same architecture as Frontier with a smarter painter. Border
tiles are split by enemy pressure (sum of adjacent enemy strength):

  - Low pressure (<= 50% of max border pressure) → ROLE_FRONT: attack.
    These are the seams, where a push has the best return on strength.
  - High pressure (> 50%) → ROLE_SINK: hold. We don't attack outward
    here unless an adjacent enemy is winnable — we let the enemy break
    on us instead of feeding strength into a tough fight.

Interior tiles get a BFS depth from FRONT tiles only (sinks are not
seeds), so the supply chain explicitly aims at the attack seams rather
than spreading uniformly around the border.

Per-army act():
  - Kill-or-stay first (Crusader-style all-in on a winnable adjacent).
  - FRONT armies → Spearhead (rear-support push outward).
  - SINK armies → balanceAttack against the weakest neighbor only,
    i.e. they trim small enemies but won't suicide into a wall.
  - INTERIOR armies → pump to the friendly neighbor with the lowest
    BFS depth (one step closer to a FRONT, not a sink).

Thesis: same executor as Frontier, smarter labeler. If PressureSink
wins more than Frontier, painter quality drove it — not tactics.`,
  act(army, game) {
    if (tryKillAdjacent(army, ATTACKER_BONUS)) return;

    const tile = army.tile;
    if (!tile) return;
    const map = game.map;
    const idx = tile.pos.y * map.width + tile.pos.x;
    const plan = paintPressureSink(game, army.player, PRESSURE_CUTOFF);
    const role = plan.roles[idx];

    if (role === ROLE_FRONT) {
      Spearhead.act(army, game);
      return;
    }
    if (role === ROLE_SINK) {
      const weakest = army.weakestAdjacent();
      if (weakest) balanceAttack(army, weakest);
      return;
    }
    if (role === ROLE_INTERIOR) {
      const next = lowestDepthFriendlyNeighbor(army, plan);
      if (next) {
        const power = army.strength - 1;
        if (power > 0.5) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
