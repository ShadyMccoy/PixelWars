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

// Hypothesis: parent (g1_0c6381) banked +33 by walking atk → def. The
// def axis is now partially explored (def 20), but `move` is still
// frozen at 0 across the entire lineage — that's an unexplored knob,
// not a ruled-out one. `move` raises the garrison floor on owned tiles,
// which is exactly the multiplier that blunts PressureSink-style
// attrition: tiles bleed less under sustained adjacent pressure, so
// borders survive the war of attrition the parent kept losing (3/5
// recent losses involved Frontier_g3 / PressureSink chip wars).
//
// Try a small 10-point shift atk → move (atk 30→20, move 0→10), keeping
// def at 20 so we don't double-walk the same axis g3_eaf9b1 already
// tested. ATTACKER_BONUS=1.4 still gates kill-or-stay, so dropping atk
// from 30→20 should barely affect which kills succeed. If rating climbs,
// move is under-shot and the next step walks further; if it drops, the
// move axis genuinely doesn't pay here and we go back to the def walk.
export default {
  name: "Frontier_g2_4ee980",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 50, atk: 20, def: 20 },
  description: "Frontier_g1 with 10 atk → move: probe the frozen move axis to raise garrison floor against attrition.",
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
