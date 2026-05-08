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

// Hypothesis: tech is locked at 10/40 and the lineage rating has
// flattened (g2→g3 only +3). 4 of 5 losses last season were to
// same-architecture siblings, so logic — not tech — has to find the
// edge. The interior pump currently fires whenever attackPower > 0.5,
// which sends every dribble forward. With def=40 our tiles are
// sturdy holders; small forwarded packets get absorbed into the
// production cycle before they coalesce into usable Spearhead push.
// Raise the pump cutoff 0.5 → 1.0 so interior tiles batch strength
// into larger waves before relaying. Same supply-chain shape, just
// arriving in fewer-but-bigger pulses at the front. If this helps
// against same-logic siblings (the bulk of the loss list) the rating
// nudges up; if it hurts, smaller-frequent pumps were the right
// rhythm and the next step walks back.
const PUMP_THRESHOLD = 1.0;

export default {
  name: "Frontier_g4_701850",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3 with interior pump threshold raised 0.5 → 1.0: batch supply into fewer, larger waves.",
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
        if (power > PUMP_THRESHOLD) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
