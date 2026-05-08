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

// Hypothesis: the atk→def walk overshot at the terminal step.
// Lineage: g0 1294 → g1 1331 (+37) → g2 1359 (+28) → g3 1370 (+11)
// → g4 1185 (-185). The deltas were already decelerating at g3
// (+37 → +28 → +11) and the final 10 atk → def step turned over
// hard. Two cousins (g4_c1a729, g4_0585a4) ship the SAME tech
// (atk 0 / def 50) and one of them beat the parent in s99, so part
// of the -185 is seed noise on a flat ridge — but the deceleration
// at g3 already said the def-only ridge has plateaued. The marginal
// def point is no longer paying.
//
// Plan: keep the def axis at its last-known-good height (def 40,
// matching g3's tech) and spend the freed 10 points on stack — a
// fresh axis. Frontier_g2_bd2a33 (a winner against the parent) is
// the only same-shell bot in the loss context that pays into stack
// and it climbed enough to land in the cousin pool, which is weak
// but real evidence stack helps the interior→front pump.
//
// Why stack over walking back to g3:
//  - Walking back to atk 10 / def 40 is just a revert; it learns
//    nothing the chain doesn't already know.
//  - Stack scales how much strength a tile can hold/deliver before
//    redistribution — that's exactly the bottleneck on lab1
//    (30×22, maxArmy 12, growth 1.8) where Spearhead pushes and
//    Conduit-style relays bottleneck on per-tile capacity, not on
//    raw production tempo.
//  - prod 50 stays intact, so total tempo is unchanged; we're just
//    moving 10 points from a saturated axis (def) to an unexplored
//    one (stack).
//
// Why the def 50 → 40 cut should be ~free:
//  - g3 ran at def 40 and that was the chain's high water mark
//    before the overshoot. The marginal point from 40→50 paid
//    negative on net, so removing it shouldn't cost us in the
//    matchups that punish thin borders (PressureSink, Frontier
//    cousins).
//  - tryKillAdjacent's bonus is the fixed 1.4 constant, not the
//    atk knob, so leaving atk at 0 keeps the kill machinery intact
//    while we test the stack axis cleanly.
//
// If rating climbs: stack is the next axis to walk. If it sags:
// the supply pump isn't the bottleneck and the next descendant
// should try move (garrison floor) instead.
export default {
  name: "Frontier_g5_45432a",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 10, prod: 50, atk: 0, def: 40 },
  description: "Frontier g5: pivot off the saturated def axis — 10 def → 10 stack, prod kept at 50, def back to g3's level.",
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
