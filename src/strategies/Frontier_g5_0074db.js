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

// Hypothesis: the parent's atk:0/def:50 step was a cliff, not a step.
// Lineage: g0→1294, g1→1331 (+37), g2→1359 (+28), g3→1370 (+11),
// g4 parent→1193 (-177). The previous decision rule "ATTACKER_BONUS
// dominates so atk:0 is safe" was falsified — losing the last 10 atk
// blew up kill economy or attackPower somewhere we didn't model.
//
// Don't just retreat to g3 (we already know that score). Test whether
// def:50 itself is the value-add when paired with non-zero atk: pull
// 10 from prod (still dominant at 40) into atk. New mix:
//   prod 50→40, atk 0→10, def 50.
// If rating climbs back above g3's 1370, def 50 is good and the
// regression came from atk starvation — next descendants should keep
// def 50 and probe other axes (stack/move) by pulling from prod
// further. If rating doesn't recover, def 50 is itself the problem
// and we walk back along the def axis.
//
// Loss context (Frontier_g4_0585a4 — same tech as parent, but beat
// us; PressureSink-style attrition; mirror-Frontier matchups) all
// fits "we couldn't finish kills late game" more than "we couldn't
// take damage" — restoring atk should help close those out.
export default {
  name: "Frontier_g5_0074db",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 10, def: 50 },
  description: "Recover from atk:0 cliff: pull 10 prod → atk, keep def 50 at max.",
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
