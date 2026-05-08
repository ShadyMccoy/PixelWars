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

// Hypothesis: parent's atk 10→0 step was a cliff, not another rung
// on the def-walk. The lineage was monotonic up to g3 (1294→1331→
// 1359→1370), then crashed -175 at g4 the moment atk hit zero.
// Season #218 confirms: parent finished 5/6, 3/6, 3/6, 3/6, 6/6 in
// its losses — across very different lineups, which is the signature
// of a structural break, not matchup variance.
//
// What the kill math actually needs: tryKillAdjacent uses atk tech
// as a multiplier alongside the 1.4x ATTACKER_BONUS inflator. At
// atk=10 the multiplier is small but nonzero; at atk=0 some kills
// that resolved at g3 stop resolving, and Spearhead front-line
// pushes lose the swing breakers. The bonus papers over a *low*
// atk, but it can't paper over zero.
//
// The two distinct sibling winners (g4_a9b303 and g4_235131) both
// landed at 0/0/40/10/50 — i.e. exactly "restore atk=10, pull from
// prod, keep def=50". That's two independent confirmations that
// (atk=10, def=50) is the live floor and prod=50 was past its
// diminishing-returns knee. Frontier_g4_95721f, which shares the
// parent's broken 0/0/50/0/50 config, also "beat" the parent in s31
// — i.e. same-config noise — so there's no rescue at atk=0.
//
// Smallest reviewable correction from the parent: one 10-point
// shift, prod 50→40 and atk 0→10. This walks back across the cliff
// to the known-good plateau. If rating recovers toward ~1370+, the
// atk=0 cliff theory is confirmed and future descendants should
// explore stack/move from the 40/10/50 base, not push def to 60.
// If rating stays low, prod=50 was load-bearing for this parent's
// supply chain in a way it wasn't for the siblings, and the next
// descendant should pull atk from def instead.
export default {
  name: "Frontier_g5_5fbcad",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 40, atk: 10, def: 50 },
  description: "Frontier_g4_39c6ff with prod 50→40, atk 0→10: walk back across the atk=0 cliff that cost the parent 175 points.",
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
