import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: tech is locked at the parent's allocation
// (prod 50, atk 10, def 40). Atk has been walked all the way down to
// 10 over three generations, but ATTACKER_BONUS has stayed pinned at
// 1.4 since g0 — a value originally tuned for atk 30–50 attackers.
// With our weakened punch, the 1.4x optimism pushes borderline
// engagements into "commit", and a failed kill is now much more
// costly because we have fewer offensive units to lose. Lowering the
// bonus to 1.25 should reject the most marginal commits (the ones we
// were probably losing anyway) while still capturing clearly-winnable
// adjacents. The parent lost season #259 to vanilla Frontier (atk 50)
// twice — those matchups punish us for failed atk-10 commits more
// than for slightly fewer commits, so a more conservative threshold
// should help on net. If the rating dips, the kill-commit door was
// already optimal at 1.4 and the next descendant should instead try
// raising the interior forwarding threshold.
const ATTACKER_BONUS = 1.25;

export default {
  name: "Frontier_g4_653b72",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g3 with ATTACKER_BONUS 1.4 → 1.25: recalibrate kill-commit threshold for atk=10 punch.",
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
