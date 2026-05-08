import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent (g6_05514a) dropped -53 vs g5_8000dc despite the
// "follow the def slope" plan. Tech is locked, so look at the act()
// for a knob that interacts badly with the current tech mix.
//
// The standout: ATTACKER_BONUS = 1.4 was inherited from the original
// Frontier (atk:50) and never re-tuned as this lineage walked atk
// down to 3. tryKillAdjacent uses that multiplier as the assumed
// attacker-side advantage when deciding whether to commit a kill.
// At atk:50 a 1.4x optimism rarely backfires — the raw damage
// dominates. At atk:3, raw offense is tiny and a 1.4x assumption is
// systematically over-greedy: we green-light kill attempts that
// barely pencil out, lose the trade, and leave the border thinner
// against the next tick of attrition. That fits the loss pattern:
// 458–817-tick games where parent finished #2–#4, exactly the long
// border-attrition contests where wasted offense compounds.
//
// One small change: drop ATTACKER_BONUS 1.4 → 1.25. Conservative
// kill detection — only commit to an adjacent kill when the margin
// holds even with a smaller assumed attacker advantage. Pairs with
// def:52: we'd rather hold a strong tile than spend it on a coin-flip
// kill. Everything else (Spearhead front, interior pump, fallback)
// is unchanged so the rating delta attributes cleanly.
//
// Read of the result:
//  - Rating ↑: low-atk lineages should re-tune the bonus per tech;
//    next descendant can keep nudging (1.25 → 1.15) to find the floor.
//  - Rating ≈: bonus isn't load-bearing at this tech mix; pivot to
//    the interior power threshold (currently 0.5) instead.
//  - Rating ↓: the 1.4 default was actually catching kills we needed
//    even at atk:3; revert and try the interior threshold axis.
const ATTACKER_BONUS = 1.25;

export default {
  name: "Frontier_g7_172577",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 45, atk: 3, def: 52 },
  description: "Frontier_g6_05514a with ATTACKER_BONUS 1.4→1.25: re-tune kill optimism for the lineage's atk:3 reality.",
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
