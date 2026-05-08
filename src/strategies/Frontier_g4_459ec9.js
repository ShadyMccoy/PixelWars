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
// Hypothesis: parent rating flatlined (+0 vs grandparent) — the def
// axis has stopped paying at this tech mix. Tech is locked, so probe
// the one behavioral knob the painter pattern exposes: the INTERIOR
// delegation power floor (currently 0.5).
//
// Raising the floor 0.5 → 1.0 means interior tiles only push strength
// forward once they've accumulated a fuller working stack. Pulses
// become fewer-but-fatter, which is the same shape a `stack` tech
// bump would produce — and sibling g3_ad3d81 already showed stack is
// the live axis in this lineage. We can't touch tech, but we can
// emulate part of its effect by holding interior strength longer.
//
// Loss context fit: parent's losses were long games (445–933 ticks)
// against other Frontier variants and Smartiepants. Long games are
// where compounded supply-chain pulses pay best — a single fat pulse
// arriving at FRONT lets Spearhead crack a border tile that two thin
// pulses bounce off, and the 1.4x ATTACKER_BONUS amplifies the
// difference at the kill threshold.
//
// If rating climbs: behavioral lever is alive; future descendants can
// push the floor higher (1.5, 2.0). If it drops: the supply chain
// needed the steady drip and we should revert.
const INTERIOR_POWER_FLOOR = 1.0;

export default {
  name: "Frontier_g4_459ec9",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3_eaf9b1 with INTERIOR power floor raised 0.5→1.0: emulate a stack-tech bump through behavior since tech is locked.",
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
        if (power > INTERIOR_POWER_FLOOR) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
