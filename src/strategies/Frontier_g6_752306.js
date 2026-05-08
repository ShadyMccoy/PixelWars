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
const INTERIOR_PUMP_FLOOR = 1.0;

// Hypothesis: tech is locked at the lineage's hill-climbed optimum
// (prod 50, atk 10, def 40 -> rating ~1282), and the parent's losses
// in season #253 are all close-race finishes vs fellow Frontiers
// (#2 four times, #4-5 once). We survive but don't close out. Since
// tech is frozen, the only lever is logic.
//
// Single knob: the interior-pump gate. Parent forwards to the
// lowest-depth friendly neighbor whenever army.attackPower > 0.5.
// On lab1 (growth 1.8, prod 50, maxArmy 12) armies recharge fast,
// so this floor lets interior tiles fire many small half-pulses.
// Each pump consumes the army's action for the tick; a thin pulse
// followed by another thin pulse the next tick costs two interior
// turns to deliver what one fat pulse could.
//
// Raise the floor to 1.0: interior tiles wait one extra tick and
// forward a full attack's worth at once. Why this should help vs
// fellow Frontiers specifically: ROLE_FRONT delegates to Spearhead,
// whose rear-support stencil push compounds with momentum. The
// front's effective punch scales sub-linearly in how often the
// supply pulses arrive but ~linearly in the size of each pulse, so
// fewer-but-fatter pumps should crack borders harder than many
// half-pumps. In a close race against another painter (same plan,
// same kill rule) the bot whose front pulses are more concentrated
// has the edge in border exchanges.
//
// Risk: deep interiors get one tick of extra latency, which could
// underfeed a contested front. Mitigation is structural -- prod 50
// recharges quickly, and the painter's BFS already routes pulses
// the shortest way, so the latency is bounded to ~one tick added
// per hop. If the season says no, next descendant walks the floor
// the other direction (0.5 -> 0.25 or 0.0) to test the opposite
// thesis: that we want more, not fewer, supply-chain firings.
export default {
  name: "Frontier_g6_752306",
  author: "shady",
  version: 1,
  tech: { move: 0, stack: 0, prod: 50, atk: 10, def: 40 },
  description: "Frontier_g5_ce16cd with interior pump floor 0.5 -> 1.0: fewer, fatter supply pulses to the front.",
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
        if (power > INTERIOR_PUMP_FLOOR) army.attack(next, power);
        return;
      }
    }
    SlowAndSteady.act(army, game);
  },
};
