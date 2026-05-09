import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent's 1.4 -> 1.5 ATTACKER_BONUS bump backfired
// (rating 1271 -> 1129, -142). Both higher (1.55, g4_a920c5) AND
// lower (1.25, g6_9d691d) bonuses beat the parent, which says the
// bonus axis is not the binding constraint at this tech profile —
// 1.5 just happens to land in a dead zone. The parent's own note
// flags the next axis to explore: "the interior power>0.5
// threshold."
//
// The parent's losses are 4-of-5 #2 finishes in long mirrors
// (470-1076 ticks) — the classic "alive but not closing"
// signature. With def 40 / atk 10, interior tiles accumulate
// slowly, and `power > 0.5` keeps a meaningful fraction of them
// idle waiting to clear the gate. The front, meanwhile, is the
// thing that actually closes games — Spearhead acts there and
// needs supply. Lowering the interior gate lets smaller interior
// armies start flowing toward the front sooner, feeding Spearhead
// during exactly the late-grind regime where mirrors are decided.
//
// One-knob change: interior threshold 0.5 -> 0.3. ATTACKER_BONUS
// stays at the parent's 1.5 to isolate the variable — if rating
// climbs, the interior axis is live and a future descendant can
// also revisit the bonus from a known-good interior setting; if
// it drops, the front doesn't actually want more low-power supply
// and we revert.
//
// Why 0.3 (not 0.4 or 0.1):
//  - 0.4 is a token nudge unlikely to flip enough decisions to
//    register in season noise.
//  - 0.1 risks bleeding stack: interior tiles attacking with
//    almost-empty power waste production and leave gaps the
//    painter's role pass has to repair next tick.
//  - 0.3 is the smallest step that meaningfully widens the gate
//    while still requiring a non-trivial army before flowing.
//
// Tech is locked vs parent (lineage tech-search has flattened).
const ATTACKER_BONUS = 1.5;
const INTERIOR_POWER_GATE = 0.3;

export default {
  name: "Frontier_g7_0b8c75",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g6_f29ac0 with interior power gate 0.5 -> 0.3: feed Spearhead sooner in long mirrors.",
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
        if (power > INTERIOR_POWER_GATE) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
