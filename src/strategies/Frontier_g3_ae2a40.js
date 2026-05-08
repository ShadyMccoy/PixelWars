import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent (g2) has atk:20 / def:30 — low raw attack power.
// With ATTACKER_BONUS=1.4, tryKillAdjacent fires on thin margins:
// effective attack ~28, so a non-trivial fraction of attempted kills
// fail or barely succeed, bleeding armies in long attrition games.
// The recent losses are exactly that profile — placed #2/#3/#5 in
// drawn-out matches (ticks 383–684) against other Frontier variants
// and PressureSink-likes that punish wasted armies.
//
// One-knob logic change: tighten ATTACKER_BONUS from 1.4 → 1.2.
// We'll only commit kills when we genuinely have ~83% of the target's
// strength (vs ~71% before). Fewer marginal kill attempts → fewer
// wasted attackers → more bodies retained for the def:30 borders to
// soak pressure. Tactics, painter, supply chain unchanged. Tech is
// inherited verbatim — this lineage flat-lined on tech and we're
// testing whether kill-discipline is the lever now.
//
// If rating ↑: kill threshold was too loose at this tech mix; next
// descendant can probe 1.1 or push def-funded tactics. If ↓: 1.4 was
// load-bearing for tempo against fast bots; revert and try the
// interior power>0.5 threshold instead.
const ATTACKER_BONUS = 1.2;

export default {
  name: "Frontier_g3_ae2a40",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 20, def: 30 },
  description: "Frontier_g2 with ATTACKER_BONUS 1.4 → 1.2: tighten kill discipline at low-atk tech to stop bleeding armies in attrition.",
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
