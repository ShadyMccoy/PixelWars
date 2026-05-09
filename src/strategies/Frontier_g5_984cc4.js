import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent (g4_5ef171, INTERIOR_RELAY_MIN=0.25, ATTACKER_BONUS=1.4)
// already validated the relay-threshold drop (g3 1219 -> g4 1246, +27).
// Sibling Frontier_g4_41a970 took the SAME tech (50/10/40) and instead
// tightened ATTACKER_BONUS 1.4 -> 1.2 — and that bot beat the parent
// in the recent losses list (s283 #1 of 6, s272 #1 of 6 vs parent's #4
// and #6 in those games). The two tweaks are orthogonal:
//   - INTERIOR_RELAY_MIN governs interior supply-chain throughput
//     (more weak armies relay forward instead of falling to SaS).
//   - ATTACKER_BONUS governs front-line commit confidence
//     (fewer wasted commits against defenders we can't actually kill
//     when our raw atk is only 10).
// They live in disjoint code paths, so both wins should stack.
//
// Combine them: keep parent's 0.25 relay floor, adopt 41a970's 1.2 bonus.
// On lab1's long attrition matchups (parent's worst losses were
// ticks=574-963), preserving border armies via more selective kills
// should compound with the extra interior relay steps already feeding
// the front. If rating climbs, the two axes truly are independent and
// the next descendant can probe a third orthogonal logic knob (e.g.
// the 0.5 power floor in INTERIOR delegation, or front/interior split
// rules). If rating drops, the bonus and threshold interact more than
// expected — most likely the tighter bonus starves Spearhead of the
// throwaway-kill flow that the relayed weak interiors were feeding.
// In that case the next descendant should walk back to ATTACKER_BONUS
// = 1.3 (half-step) rather than touch INTERIOR_RELAY_MIN again.
const ATTACKER_BONUS = 1.2;
const INTERIOR_RELAY_MIN = 0.25;

export default {
  name: "Frontier_g5_984cc4",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g4_5ef171 with ATTACKER_BONUS 1.4->1.2: stack parent's 0.25 relay floor with sibling g4_41a970's tighter kill-commit threshold.",
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
        if (power > INTERIOR_RELAY_MIN) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
