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

// Hypothesis: parent (g1) walked atk 50→30, def 0→20 and gained +21,
// but still loses 5/5 recent matches to PressureSink_g1_8f121c on lab1.
// The original thesis — "borders flip easily under sustained pressure,
// def hardens them" — earned rating but didn't actually solve the
// PressureSink matchup, which suggests we haven't pushed def far enough
// to matter against an attrition opponent.
//
// Take one more step on the same axis: atk 30→20, def 20→30. Same
// painter, same per-army logic, prod untouched. Rationale for staying
// on this axis instead of opening stack/move:
//   - Sibling g3_69a9ba already validated stack exploration further
//     down the chain (from a g2 with def 30), so the def-30 plateau
//     is a known viable jumping-off point worth confirming directly.
//   - The 1.4x attacker bonus on tryKillAdjacent already inflates atk
//     beyond its raw value, so the marginal kill we lose at atk 20 is
//     small; the extra def buys survival on contested borders where
//     SlowAndSteady/Spearhead are otherwise paper-thin.
//   - Prod stays at 50 — the interior pump is the engine, and dropping
//     it without compensating burst (stack) tends to starve the front.
// If rating climbs, def 30 is the right plateau and stack/move become
// the next axes to probe. If it drops, atk 30 was load-bearing for
// the kill-or-stay branch and we know def 20 was the right knee.
export default {
  name: "Frontier_g2_8b31d1",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 20, def: 30 },
  description: "Frontier_g1 with another 10 atk → def: harder borders to actually survive PressureSink attrition.",
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
