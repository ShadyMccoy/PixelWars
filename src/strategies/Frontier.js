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

export default {
  name: "Frontier",
  author: "shady",
  version: 1,
  description: "Painter-based: BFS-depth from the border, interior pumps strength toward the front.",
  summary: `The first painter-pattern bot. Once per tick we label every
friendly tile with a role:

  - FRONT: the tile has at least one non-friendly neighbor (off-map,
    empty, or enemy). These are the tiles that can actually fight.
  - INTERIOR: fully enclosed by friendlies. They cannot fight directly
    but they hold strength that should reach the front.

Each interior tile gets a BFS depth = distance (in friendly steps) to
the nearest front. Per-army act() then dispatches on role:

  - Always check kill-or-stay first — a winnable adjacent enemy gets
    a Crusader-style all-in attack with the 1.4x attacker bonus.
  - FRONT armies fall back to Spearhead (rear-support stencil push).
  - INTERIOR armies pump strength to the friendly neighbor with the
    lowest BFS depth — i.e. one step closer to the front. SlowAndSteady
    if no such neighbor is found, which only happens on tiny
    territories.

This is the canonical demo for the painter pattern: the same per-army
mechanic produces visible "supply chain" behavior because every interior
tile knows which way the front is, not just whether it's a border.`,
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
        const power = army.strength - 1;
        if (power > 0.5) army.attack(next, power);
        return;
      }
    }
    // Tile we don't own (mid-tick attacker, or contested). Default to
    // a safe expansion move.
    SlowAndSteady.act(army, game);
  },
};
