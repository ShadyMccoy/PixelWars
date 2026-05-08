import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent's tech walked all the way to atk=10 / def=40. The
// def axis paid off, but atk is now genuinely thin. ATTACKER_BONUS=1.4
// is the optimism multiplier tryKillAdjacent uses to decide whether to
// commit to a kill. With atk=10 the underlying combat output is weak,
// so a 1.4x optimism factor is more likely to mis-predict a kill —
// committing to attacks that fail and bleed our border tiles. The
// recent losses (#260) include several near-mirrors that beat us by a
// hair (placed #2 to Frontier_g3_bd5683, _g3_61b131, _g6_05514a,
// _g6_4cad37, and _g1_0c6381 — all with similarly hardened borders),
// which is consistent with marginal kill-or-stay decisions tipping
// against us. Pull ATTACKER_BONUS 1.4 → 1.2 so we only commit to kills
// when the predicted margin is wider, conserving border armies under
// def=40 instead of trading them on speculative kills. If rating drops
// the next descendant can walk it back the other way (1.4 → 1.5).
const ATTACKER_BONUS = 1.2;

export default {
  name: "Frontier_g4_5de888",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3_eaf9b1 with ATTACKER_BONUS 1.4→1.2: be more conservative on kill commitments now that atk=10 is thin.",
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
