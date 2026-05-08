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

// Hypothesis: parent (atk 40 / def 10 / prod 50) sits between two winning
// cousin configs — g1_0c6381 (atk 30 / def 20) and g2_461435 (prod 40 /
// atk 50 / def 10) — both of which beat it. The def axis already has a
// proven cousin at def 20, so re-walking that exact point is redundant.
// Stack is the *other* fully unexplored axis (frozen at 0 through the
// whole Frontier lineage), and it directly amplifies the bot's central
// mechanic: the interior pump path repeatedly attacks own tiles to
// shovel strength toward the front, and stack tech raises how much
// effective army survives those internal transfers / accumulates per
// tile.
//
// Take 10 from atk and put it in stack: atk 40→30, stack 0→10, keep def
// 10 and prod 50. Marginal atk loss is cheap because tryKillAdjacent
// already multiplies by 1.4x, so most kills the parent wins still
// succeed. Marginal stack gain compounds along every interior →
// frontier transfer chain, which is the longest path on lab1 (30×22)
// and where Frontier earns its supply-chain advantage. If rating climbs
// we know the supply pump was bottlenecked, not border thickness.
export default {
  name: "Frontier_g2_ddb046",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 30, def: 10 },
  description: "Frontier g2: 10 atk → 10 stack to amplify the interior-to-front supply pump.",
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
