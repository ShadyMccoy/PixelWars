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
const INTERIOR_PUMP_FLOOR = 1.5;

// Hypothesis: tech is pinned at the def-maxed corner (atk 0 / def 50)
// and the table shows gains have flattened (g3 +2, g4 +2). Parent's
// recent losses are 4/5 close #2 finishes against other Frontier
// variants — we survive into the late game but don't close. With
// atk=0 our front depends entirely on Spearhead getting strength
// delivered from the interior. The current pump rule fires at any
// power > 0.5, which means interior tiles ship many tiny dribbles
// rather than letting strength gather into meaningful waves. Raise
// the pump floor 0.5 → 1.5 so interior tiles consolidate before
// forwarding. Against the close-loss profile this should give
// Spearhead chunkier ammo at the front when it actually matters,
// instead of constant micro-trickle that gets ground down by a
// stiffer enemy border. If rating climbs, consolidation > continuous
// flow at this defense allocation; if it drops, the constant pump
// was load-bearing for sustaining front pressure and we'll know to
// look elsewhere (e.g. role-conditional kill bonuses) next gen.
export default {
  name: "Frontier_g5_55d782",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 0, def: 50 },
  description: "Frontier_g4 with interior pump floor 0.5→1.5: consolidate strength before forwarding so Spearhead gets chunkier ammo.",
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
        if (power > INTERIOR_PUMP_FLOOR) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
