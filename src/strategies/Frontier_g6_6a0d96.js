import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: tighten the kill-margin from 1.4 → 1.25.
//
// Tech is locked at atk:3 / def:47 — we have almost no attacker power.
// Parent's losses (season #258) are all close #2/#3 finishes to bots
// with much higher atk (Frontier_g3_bd5683 atk=20, Frontier_g3_69a9ba
// atk=20, vanilla Frontier atk=50, Frontier_g2_34255e atk=20). Those
// opponents trade kills favorably; we don't.
//
// `tryKillAdjacent` uses the bonus arg as the multiplier it assumes it
// gets when checking whether our power overpowers the defender. With
// atk:3 our absolute attack power is tiny, so a borderline-kill that
// 1.4 says we'll win is near-pyrrhic — defender often survives with
// scraps, or we mutually annihilate, and our def-47 territory loses
// the exchange. Passing 1.25 instead of the literal game bonus (1.4)
// adds a 10% safety margin: we only commit to kills we'd still win at
// a slightly worse roll. The expected behavior change is small (most
// kills are not borderline) but should bias us away from the exact
// trades we're losing.
//
// If rating rises: low-atk variants over-attack at literal-1.4 and
// future descendants in the def-heavy lane should keep this tighter
// margin. If it falls: the missed kills cost more than the avoided
// pyrrhics, and the next experiment should walk the opposite direction
// (1.4 → 1.5) or move the change into Spearhead's front behavior.
const ATTACKER_BONUS_KILL = 1.25;

export default {
  name: "Frontier_g6_6a0d96",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 3, def: 47 },
  description: "Frontier_g5_8000dc with kill-margin 1.4→1.25: with atk:3, only commit to kills with a 10% safety buffer to avoid pyrrhic trades.",
  act(army, game) {
    if (tryKillAdjacent(army, ATTACKER_BONUS_KILL)) return;

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
