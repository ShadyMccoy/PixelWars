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

// Hypothesis: parent (g3_eaf9b1, atk 10 / def 40) banked +26 walking
// the def axis. Two independent siblings (g3_69a9ba and g3_ad3d81)
// both BEAT this parent by pulling 10 prod → stack on top of the g2
// baseline (atk 20 / def 30). That's two converging signals that the
// stack axis pays off when layered on a defense-heavy Frontier.
//
// Tiny compound bet: apply the siblings' winning step (prod 50→40,
// stack 0→10) on top of THIS parent's already-validated def 40.
// Resulting tech: { move:0, stack:10, prod:40, atk:10, def:40 }.
//
// Why this should help against the loss context (PressureSink #1 in
// s393, lost to other Frontier variants in close late games):
//  - def 40 is preserved, so PressureSink attrition still gets
//    blunted the way the parent already validated.
//  - The 4 of 5 recent losses are #2 finishes to other Frontier
//    variants — exactly the close Frontier-vs-Frontier games where
//    Spearhead's burst on FRONT decides things, and stack 10 fattens
//    that burst (siblings demonstrated the lever works).
//  - prod 50→40 is the proven-survivable cost: two siblings already
//    won at prod 40, so we know the SlowAndSteady interior pump
//    doesn't collapse.
// If rating climbs, the def-axis and stack-axis gains stack additively
// and the next step is more stack. If it drops, the def 40 baseline
// was load-bearing on prod 50 specifically, and we walk prod back.
export default {
  name: "Frontier_g4_a450d6",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 10, def: 40 },
  description: "Frontier_g3_eaf9b1 + siblings' winning step (prod 50→40, stack 0→10): compound the validated def 40 with the validated stack opening.",
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
