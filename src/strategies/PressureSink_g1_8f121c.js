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
// Hypothesis: parent loses to Frontier consistently (5/5 recent losses).
// Frontier attacks every border; PressureSink turns >50% max-pressure
// borders into passive SINKs that only trim the weakest neighbor.
// That over-defensiveness likely costs us tempo on lab1 (small wrap map
// where pressure peaks are common but transient). Raise the cutoff so
// only the truly worst tiles sink — most borders behave like Frontier,
// preserving the sink only for genuine kill-zones.
const PRESSURE_CUTOFF = 0.8;

export default {
  name: "PressureSink_g1_8f121c",
  author: "shady",
  version: 1,
  description: "PressureSink with a higher pressure cutoff (0.8) — fewer SINK tiles, more aggressive FRONT coverage.",
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
        const power = army.attackPower;
        if (power > 0.5) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
