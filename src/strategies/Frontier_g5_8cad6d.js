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

// Hypothesis: parent (0/0/50/0/50) crashed -167 from g3. Sibling
// g5_705be5 already tested the atk-cliff theory (atk 0→5) and
// recovered. Rather than re-tread that walk-back, this descendant
// explores the only axis the lineage has *never* touched: stack.
// Every ancestor g0→g4 has stack=0. Spearhead's whole thesis is
// stacking armies for momentum at the front, so a stack=0 build is
// arguably leaving Spearhead's main lever on the table.
//
// Take 10 from prod (the saturated axis — flat at 50 across the whole
// chain, no evidence the marginal prod point is still paying) and
// put it into stack: prod 50→40, stack 0→10. Keep atk=0/def=50 so
// the stack signal is isolated from the atk-cliff confound that
// 705be5 is already pulling on.
//
// Why this should help against the loss context:
//   - 4/5 recent losses were Frontier-family beats decided on
//     border slugfests; Spearhead with non-zero stack should land
//     thicker hits at ROLE_FRONT, where the parent currently
//     attacks with whatever production yields.
//   - PressureSink wins via attrition; def=50 is preserved, so
//     incoming damage isn't worse, but our outgoing punches at the
//     border get a stack multiplier.
// If rating climbs, stack has slope on this build and the next
// descendant pushes further (stack 20). If it drops, prod was
// load-bearing and the prod→stack trade is wrong on this base.
export default {
  name: "Frontier_g5_8cad6d",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 0, def: 50 },
  description: "Frontier_g4 with 10 prod → stack: first probe of the untouched stack axis, isolating the signal from the atk-cliff walk-back.",
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
