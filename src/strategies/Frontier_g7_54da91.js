import SlowAndSteady from "./SlowAndSteady.js";
import Spearhead from "./Spearhead.js";
import {
  paintFrontier,
  lowestDepthFriendlyNeighbor,
  tryKillAdjacent,
  ROLE_FRONT,
  ROLE_INTERIOR,
} from "./painter.js";

// Hypothesis: parent reaches the late game in contention (4 of 5
// recent losses are #2/#3 finishes) but doesn't close. With tech
// locked at atk:10/def:40, finishing a near-kill depends on big
// hammers actually arriving at the front, not drip-fed slivers. The
// INTERIOR delegation currently fires whenever attackPower > 0.5,
// which lets interior tiles push tiny waves forward and starve the
// next-cycle relay. Raise that floor 0.5 -> 1.0: interior tiles
// wait until they hold one full army before pushing, producing
// fewer-but-larger relays toward the front. ATTACKER_BONUS stays
// at the parent's 1.5 — the parent's bet was that the bot accepts
// marginal kills; this descendant tries to back those kill attempts
// with real mass instead of paper.
//
// Why 1.0 and not larger: 1.0 is the natural "one full army"
// threshold; a bigger floor (e.g. 2.0) risks starving the front
// outright on small interior armies and is a step too far for a
// season-sized signal. If rating climbs, the supply chain wants
// chunkier relays and a future descendant can probe 1.5 or look at
// front pacing instead. If it falls, the 0.5 drip-feed was
// load-bearing for keeping constant pressure on neighbors and the
// next descendant should leave INTERIOR alone and probe a
// different lever (role split, ATTACKER_BONUS walkback toward the
// 9d691d=1.25 sibling that beat the parent in s289).
//
// Tech inherited verbatim from parent via spread — this lineage's
// tech ceiling has been hill-climbed for many generations and the
// gains have flattened, so logic is the experiment.
const PARENT_TECH = { move: 0, stack: 0, prod: 50, atk: 10, def: 40 };
const ATTACKER_BONUS = 1.5;
const INTERIOR_POWER_FLOOR = 1.0;

export default {
  name: "Frontier_g7_54da91",
  author: "shady",
  version: 1,
  tech: { ...PARENT_TECH },
  description: "Frontier_g6_882719 with INTERIOR power floor 0.5 -> 1.0: bigger consolidated relays so ATTACKER_BONUS=1.5 kill attempts arrive with real mass.",
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
        if (power > INTERIOR_POWER_FLOOR) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
