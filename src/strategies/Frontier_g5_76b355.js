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
// Hypothesis: parent's tech (atk 0 / def 50) makes every army sticky
// but weak. The interior supply chain has a hard 0.5 power gate
// before an INTERIOR tile pumps toward the front; at atk 0 every
// per-tile pulse is smaller, so that gate fires less often and
// reserves stall mid-board. Loss context shows the parent gets
// out-pushed in long games (ticks 422–590 vs other Frontier
// descendants) — exactly the regime where a slow supply chain hurts.
// Drop the interior pump threshold 0.5 → 0.25 so INTERIOR tiles relay
// strength forward more frequently. The FRONT layer stays better-fed
// against multi-tick Spearhead pushes (the case where def 50 alone
// wasn't enough). Same tech as parent — only the gate moves.
const INTERIOR_PUMP_THRESHOLD = 0.25;

export default {
  name: "Frontier_g5_76b355",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g4 with interior pump gate 0.5→0.25: feed FRONT more often when atk:0 makes pulses small.",
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
        if (power > INTERIOR_PUMP_THRESHOLD) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
