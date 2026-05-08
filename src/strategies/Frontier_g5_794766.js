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

// Hypothesis: g3→g4 (def 40→50, atk 10→0) jumped +77 rating, so the
// defense-maxed border is the right anchor — don't regress on def.
// The atk/def axis is now exhausted (atk=0, def=50), but move and
// stack have been frozen at 0 across the entire lineage; per the
// prompt, frozen columns are unexplored, not ruled out. Take 10 from
// prod → stack, keeping prod at 40 (still matches vanilla Frontier's
// prod). Why stack: the painter pumps interior armies along a BFS
// gradient toward FRONT tiles, so reinforcements actually merge en
// route. With stack 10, those merges produce a larger effective army
// arriving at the seam, which should help against the bots that
// outpushed the parent in season #157 — Frontier_g3_8c5891 (atk:45,
// runs Spearhead with the bonus) and Frontier_g2_34255e (also runs
// Spearhead, slightly weaker tech). A stiffer arrival on FRONT tiles
// makes Spearhead's own rear-support attack land harder. Risk: prod
// 40 means slightly slower garrison growth, but def 50 already lets
// us survive longer pushes per tile, and stack should compound on the
// supply chain we already have. If rating climbs, stack is live and
// the next gen should push it further; if it drops by ~prod regress
// alone, we know stack≤10 is dead weight here.
export default {
  name: "Frontier_g5_794766",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 40, atk: 0, def: 50 },
  description: "Frontier_g4 with 10 prod → stack: keep the def-maxed wall, test the unexplored stack axis on painter-pumped reinforcements.",
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
