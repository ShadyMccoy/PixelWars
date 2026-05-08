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

// Hypothesis: the parent (g4, 50/0/50) crashed -196 from g3 (50/10/40).
// The lineage was paying diminishing returns on def (g1 +37, g2 +28,
// g3 +11) and then collapsed when atk hit 0. The most likely cause is
// that the last 10 atk → def step crossed a cliff: with atk:0, the
// 1.4x ATTACKER_BONUS multiplies a much weaker base, so tryKillAdjacent
// kills that worked at atk:10 stop closing — and Frontier-vs-Frontier
// matchups (which dominate the loss list: g4 clones, g2 clones) are
// decided on the kill margin, not on def's attrition.
//
// Test the cliff hypothesis with a half-step walk-back: atk 0→5,
// def 50→45. Same architecture, same prod pump.
//   - If rating recovers most of the -196, the cliff is between
//     atk 0 and atk 5 → next descendant tries atk:3 to bracket it.
//   - If rating barely moves, def:50 itself was overshot and the
//     next step should walk further back toward the g3 50/10/40 floor.
//   - If rating drops further, atk is not the issue and def:50 is
//     wrong on its own — pull from prod/move axes next.
export default {
  name: "Frontier_g5_705be5",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 5, def: 45 },
  description: "Frontier_g4 walked back a half-step: 5 def → atk to test whether atk:0 crossed a kill-margin cliff.",
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
