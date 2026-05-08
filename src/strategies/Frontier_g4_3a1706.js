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

// Hypothesis: the atk→def walk has paid out monotonically and the
// per-step gain is *accelerating*, not flattening:
//   g0 50/0  → 1374
//   g1 30/20 → 1395 (+21)
//   g2 20/30 → 1419 (+24)
//   g3 10/40 → 1446 (+27)  ← parent
// A flattening curve would say "stop"; an accelerating one says the
// local optimum is further out. Take the same 10-point step one more
// time: atk 10→0, def 40→50.
//
// Why we expect kills not to collapse at atk=0:
//  - tryKillAdjacent multiplies by ATTACKER_BONUS=1.4, which is
//    independent of the atk tech knob. Kills that succeeded at atk=10
//    via the bonus will still mostly succeed at atk=0.
//  - The Spearhead path that handles ROLE_FRONT leans on stack
//    momentum and supply pressure, not raw atk multiplier.
//  - Loss context shows attrition specialists (PressureSink,
//    Frontier_g1_0c6381 with def:20) are what beats us — exactly the
//    matchups where another step of border hardening should help.
//
// If rating drops, we'll know def=40 was the local optimum and walk
// back; if it climbs again, the def axis has more room. Same step
// size (10) as every prior generation, so the experiment is clean.
export default {
  name: "Frontier_g4_3a1706",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g3 with another 10 atk → def: continue the accelerating def walk to atk 0 / def 50.",
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
