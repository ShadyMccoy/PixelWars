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

// Hypothesis: parent's atk 0 → 0 / def 40 → 50 step crashed -183. The
// def axis didn't poison; the atk=0 floor did. Two pieces of direct
// evidence:
//   - Frontier_g4_a9b303 (prod 40, atk 10, def 50) BEAT the parent.
//     Same def=50, but kept atk=10. So def=50 is fine IFF atk>=10.
//   - Parent's own losses #2/#3/#5 are won by bots with atk>=10
//     (g3_ca36f8 atk 20, g4_a9b303 atk 10, g4_047f81 factory).
//   - tryKillAdjacent fires every tick and the kill check scales with
//     the attacker's atk multiplier; ATTACKER_BONUS=1.4 inflates but
//     doesn't replace it. atk=0 turns Spearhead's pushes and our
//     tryKillAdjacent into a noticeably weaker engine.
//
// So: rebase off g3's proven floor (10 atk / 40 def, rating 1370) and
// take one targeted probe on the only axis the entire Frontier lineage
// has never touched: move. Move's frozen-at-0 column is signal that
// the axis is unexplored, not ruled out. lab1 is 30x22 wrap with the
// painter running an interior->front supply pump; a non-zero garrison
// floor (move tech) means the supply chain leaves a thicker residue
// behind each pump tick, which should let Spearhead's front pushes
// retain more strength after the chain delivers to them. The 10-point
// step matches the lineage's standard probe size.
//
// Pull the 10 from prod, not from def or atk:
//   - def=40 was the proven local optimum at g3. Don't disturb it.
//   - atk=10 is the floor the parent just demonstrated we can't cross.
//   - prod=50 has been frozen since g0 and ca36f8 already showed
//     prod 50 -> 40 is survivable in this architecture.
//
// Read on rating:
//   - climbs: move axis is alive; next descendant can keep walking it.
//   - flat:   move=10 is neutral, lineage stays at g3 floor.
//   - drops:  the supply pump valued raw prod over garrison residue
//             on this map, and we walk move back to 0.
export default {
  name: "Frontier_g5_1e9c86",
  author: "shady",
  version: 1,
  tech: { move: 10, stack: 0, prod: 40, atk: 10, def: 40 },
  description: "Rebase to g3's atk 10 / def 40 floor (parent's atk=0 crashed -183), probe the unexplored move axis with 10 points pulled from prod.",
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
