import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis (logic-only; tech inherited verbatim from parent):
// The ATTACKER_BONUS axis has now been swept by siblings at 1.4, 1.5,
// 1.55 (parent), and 1.6 — that knob is well-explored and the parent
// already sits near the apparent peak (1.55). The remaining untouched
// logic lever is the INTERIOR-role power gate: the parent only feeds
// an interior army forward to its lowest-depth friendly neighbor when
// `power > 0.5`. Everything below that floor sits in place each tick.
//
// Why this matters in *our specific loss profile*:
//  - 4 of the parent's 5 listed losses are long Frontier-mirror grinds
//    (568, 582, 574, 1503, 736 ticks). At lab1's growth=1.8 / maxArmy=12,
//    by tick ~500 every player has many "small" interior tiles whose
//    armies regenerate just below 0.5 power between ticks. With the
//    current gate those tiles never feed forward — they idle while the
//    front is the only place pressure actually trades.
//  - In a mirror, the winner is whoever lands more conversions per
//    front-tile per tick. ATTACKER_BONUS already governs *whether* a
//    given front army takes the kill; this gate governs *how many*
//    armies arrive at the front in the first place. They're orthogonal.
//  - Loss #4 (1503 ticks, finished #2) is the textbook case: we made
//    it to a long stalemate but couldn't break it. More interior feed
//    is exactly the lever for "we got to the late game in contention
//    but couldn't close."
//
// Why 0.25 (not 0.1, not 0.4):
//  - 0.5 → 0.25 halves the gate without removing it. Removing it
//    entirely (or going to 0.1) risks pushing 0-power "ghost" armies
//    or triggering attack() with effectively-no-effect calls that the
//    engine may treat as wasted actions.
//  - 0.4 is a token nudge unlikely to clear noise over a single season
//    when the parent's recent rating delta was +65 (signal threshold
//    is real).
//  - 0.25 is one calibrated step: it lets ~half-power interior armies
//    feed forward each tick, which over a 700-1500 tick grind compounds
//    into materially more pressure on the front without committing
//    micro-armies to no-op attacks.
//
// If rating climbs: the interior gate was undertuned and future
// descendants should explore 0.15 or apply role-aware gating.
// If it drops: the 0.5 floor was load-bearing (likely because below
// that, attack() costs an action without making meaningful contact)
// and this lever is closed — revert and try a different axis.
const ATTACKER_BONUS = 1.55;
const INTERIOR_FEED_MIN = 0.25;

const PARENT_TECH = { move: 0, stack: 0, prod: 50, atk: 10, def: 40 };

export default {
  name: "Frontier_g5_519f90",
  author: "shady",
  version: 1,
  tech: { ...PARENT_TECH },
  description: "Frontier_g4_a920c5 with INTERIOR feed-forward gate 0.5 -> 0.25: more interior armies push to the front in long mirror grinds.",
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
        if (power > INTERIOR_FEED_MIN) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
