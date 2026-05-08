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
// Logic-only mutation: lower the interior-pump power floor from 0.5 → 0.25.
// Hypothesis: tech is locked at atk 10 / def 40 — the lineage has bet on
// durability, so the offensive-output bottleneck is now how reliably the
// supply chain feeds FRONT tiles. The parent only pumps an INTERIOR tile
// toward its lowest-depth friendly neighbor when attackPower > 0.5; that
// gates out a lot of small but still-useful pulses each tick. Loosening
// to 0.25 lets interior tiles relay strength forward more often, which
// should compound in long games — exactly where the parent lost (4 of 5
// recent losses were to other Frontier variants in 375–788-tick games).
// If pulses below 0.25 are too weak to matter, the engine's own attack
// resolution will absorb the noise; if 0.5 was load-bearing (e.g. tiny
// pumps cost more in lost border defense than they gain at the front),
// the rating drops and we walk back.
export default {
  name: "Frontier_g4_b599c1",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3 with interior-pump threshold 0.5 → 0.25: feed the front more often in long games.",
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
        if (power > 0.25) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
