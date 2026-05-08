import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: tech is locked at atk 10 / def 40 (the lineage walked
// the def axis +254 then +4 — clearly flattening). The one logic
// knob in tryKillAdjacent is ATTACKER_BONUS, which the whole lineage
// has kept at 1.4 since g0. With def 40 a tile we capture is far
// stickier than at def 0/10/20, so a borderline adjacent kill we'd
// skip at 1.4 is a much better bet for THIS tech than for the
// ancestors: even if the kill is closer than tryKillAdjacent's
// estimate, our newly-occupied tile resists the immediate retaliation.
// Conversely, a missed kill (we sit on power) at atk 10 contributes
// almost nothing offensively — atk only helps when we actually swing.
// Bump ATTACKER_BONUS 1.4 → 1.5 to pick up the marginal kills that
// the parent currently skips. 4/5 recent losses were to other
// Frontier variants that won by edging us in border skirmishes;
// being slightly greedier on adjacent kills should swing some of
// those mirror matchups without exposing us, because our def cushion
// is doing the absorption work either way.
const ATTACKER_BONUS = 1.5;

export default {
  name: "Frontier_g4_f49ce8",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3_61b131 with ATTACKER_BONUS 1.4→1.5: greedier kill-or-stay now that def 40 makes captured tiles sticky.",
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
