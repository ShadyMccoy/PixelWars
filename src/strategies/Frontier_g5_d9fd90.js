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

// Hypothesis: the parent (atk 0, def 50) fell off a cliff (-175 vs g3).
// The lineage was monotonically rising on the def axis right up to
// def=40, then collapsed when atk hit 0. The cousin g4_235131 ran
// 40/10/50 and *beat* the parent — same def, but preserving atk=10 by
// pulling from prod. That tells us the cliff is keyed to atk=0
// specifically (likely because tryKillAdjacent and Spearhead's attack
// output still scale on the atk multiplier, even with the 1.4x bonus
// flooring kill checks), not to def=50.
//
// Smallest possible step back from the cliff: pull just 5 from prod
// and put it on atk, keeping def=50 pinned. This isolates the variable.
//   parent g4: 0/0/50/0/50  (cliff)
//   this g5:  0/0/45/5/50   (toe back over the line)
//
// Why a 5-point step instead of reverting to g3 (10/40) or copying the
// cousin (40/10/50):
//   - Reverting throws away the def=50 data point, which we'd like to
//     preserve since the cousin's rating implies def=50 is viable when
//     paired with nonzero atk.
//   - Copying the cousin's 40/10/50 doesn't tell us anything new — we
//     already know that config wins. We want to learn whether the
//     cliff is at atk=0 hard-step or whether even atk=5 clears it.
//   - If this rating climbs back near g3 levels, the cliff is sharp
//     and atk just needs to be nonzero; next gen can chase def with
//     the cousin's prod-source.
//   - If it stays low, the cost is in def 50 / prod 45 itself, not in
//     the atk floor, and we walk back to def=40.
//
// Loss context (PressureSink, sustained-attrition Frontier variants)
// still benefits from def=50; this change preserves that lever.
export default {
  name: "Frontier_g5_d9fd90",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 45, atk: 5, def: 50 },
  description: "Frontier_g4 with 5 prod → atk: smallest step off the atk=0 cliff, keep def=50.",
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
