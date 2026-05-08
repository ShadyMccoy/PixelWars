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

// Hypothesis: the def-axis walk is showing clear diminishing returns
// (g1 +31, g2 +25, g3 +16). Pushing further to def 50 / atk 0 risks
// breaking tryKillAdjacent's kill math and is the obvious next step
// most siblings will try anyway. Meanwhile cousin g3_ad3d81 took the
// unexplored stack axis (10 prod → stack on top of g2's def 30) and
// beat this parent — that's positive evidence stack pays from this
// region of tech-space.
//
// Combine the two proven directions: keep parent's def-heavy base
// (atk 10 / def 40) and add cousin's stack probe by shifting 10
// prod → stack. Tech: { stack 10, prod 40, atk 10, def 40 }.
//
// Why this should help against the loss context:
//  - 4/5 of parent's losses were to other Frontier variants in long
//    games (ticks 438–817). Those are exactly the games where the
//    INTERIOR → FRONT supply pump compounds, and a higher per-tile
//    stack ceiling lets supply pulses arrive fatter and stay above
//    Spearhead's power floor longer between ticks.
//  - prod 50 → 40 is the cheap side of the trade: prod's slope is
//    flattest near the top of its range, so moving 10 off it costs
//    little vs. opening a fresh axis at zero.
//  - We keep def 40, so PressureSink-style border attrition (the
//    s155 #2-finish reason from this lineage's notes) still gets the
//    same blunting we already paid for.
// If rating climbs, stack + def stack additively. If it drops, the
// def-40 plateau was load-bearing on prod 50, not on the def number.
export default {
  name: "Frontier_g4_e70e81",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Frontier_g3 with 10 prod → stack: keep def-heavy base, layer cousin g3_ad3d81's proven stack probe.",
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
