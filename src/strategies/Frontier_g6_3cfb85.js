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
const FRONT_POWER_FLOOR = 1.0;

// Hypothesis: tech is exhausted (g4→g5 was -66/+60 just bracketing a
// cliff). All five recent parent losses are to other Frontier variants
// — mirror matches where outcome is decided by which side lands a
// clean Spearhead break first. The parent unconditionally delegates
// every FRONT-role army to Spearhead, including armies whose
// attackPower is well under 1.0. Against def:47 borders (the new norm
// in this lineage) sub-1.0 swings get absorbed without breaking
// through, but they still cost the army its turn and partially deplete
// its stack — the worst of both worlds.
//
// Tiny logic change (no tech change, inherits g5 tech via spread):
// gate the FRONT/Spearhead branch behind a power floor of 1.0. If a
// FRONT army is below the floor, fall through to the existing
// SlowAndSteady fallback so it consolidates instead of squandering a
// weak hit. Kill-margin opportunities are still captured up-front by
// tryKillAdjacent (which has the 1.4x ATTACKER_BONUS and isn't gated),
// so we don't lose any high-value kills — only the speculative-poke
// Spearhead calls that were unlikely to crack a high-def border anyway.
//
//  - If rating climbs vs g5_8000dc: weak Spearhead pokes were a real
//    leak in the mirror; we can try raising the floor further (1.2,
//    1.5) or apply the same gate to the INTERIOR-flow branch.
//  - If rating drops: Spearhead's sub-1.0 calls were doing useful
//    pressure work (tile flips, distraction, painter re-routing) and
//    the unconditional path is correct — back off this gate.
export default {
  name: "Frontier_g6_3cfb85",
  author: "shady",
  version: 1,
  tech: { ...{ move: 0, stack: 0, prod: 50, atk: 3, def: 47 } },
  description: "Frontier_g5 with FRONT-Spearhead gated behind attackPower >= 1.0; underpowered front armies accumulate via SlowAndSteady instead of bouncing off high-def enemy borders.",
  act(army, game) {
    if (tryKillAdjacent(army, ATTACKER_BONUS)) return;

    const tile = army.tile;
    if (!tile) return;
    const map = game.map;
    const idx = tile.pos.y * map.width + tile.pos.x;
    const plan = paintFrontier(game, army.player);
    const role = plan.roles[idx];

    if (role === ROLE_FRONT) {
      if (army.attackPower >= FRONT_POWER_FLOOR) {
        Spearhead.act(army, game);
        return;
      }
      // Underpowered front army: fall through to SlowAndSteady to
      // accumulate rather than throwing a sub-floor swing at def:47.
    } else if (role === ROLE_INTERIOR) {
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
