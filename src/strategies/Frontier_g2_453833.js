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

// Hypothesis: parent's g0→g1 step (atk 50→30, def 0→20) gave +31. The
// def axis is the live one in this lineage and atk is still over-spent
// — kill-or-stay already gets the 1.4x attacker bonus, so the marginal
// atk point is mostly funding kills that would have succeeded anyway,
// while every defender swap on a contested border still leans on def.
// Take one more notch in the same direction: shift another 10 atk →
// def, landing at 50/20/30. Same painter, same per-army logic. If
// rating climbs again, the lineage's def axis is still under-shot and
// the next descendant should keep pulling from atk (or try prod). If
// it flattens or dips, atk:20 was the floor and the next step should
// look elsewhere (prod or stack).
export default {
  name: "Frontier_g2_453833",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 20, def: 30 },
  description: "Frontier_g1 with another 10 atk → def (50/20/30): continue climbing the live def axis.",
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
