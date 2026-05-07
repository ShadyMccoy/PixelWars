import Conqueror from "./Conqueror.js";

// Conqueror_g1_879a88 + cheap-kill opportunism.
//
// The parent dominated season #29 with extreme move tech and Trinity-kernel
// alignment, but the alignment score is purely shape-based: it rewards
// "three in a row" toward a direction, not the EV of capturing a particular
// neighbor. So a 0.5-strength enemy sitting on our flank can be ignored for
// many ticks while the army keeps pushing the aligned direction. That tiny
// enemy is free territory and free opponent-regrowth-denial.
//
// Tweak: before running parent's alignment walk, scan neighbors for any
// adjacent enemy killable for less than CHEAP_KILL_RATIO of our attackPower.
// If one exists, take that kill instead. Cost is bounded (we keep >=60% of
// attackPower behind), so the alignment push only slips one tick — and
// often not at all, since attackPower regenerates by the next tick. If no
// cheap kill is available, behavior is byte-identical to the parent.
const BONUS = 1.4;
const CHEAP_KILL_RATIO = 0.4;

export default {
  ...Conqueror,
  name: "Conqueror_g2_e0f65e",
  description: "Conqueror_g1_879a88 + cheap-kill opportunism: snap free flank kills before alignment.",
  summary: `Inherits parent's extreme move tech (90/0/2/4/4) and Trinity-kernel
alignment scoring. Adds a single opportunistic check at the top of act():
if any adjacent enemy can be killed for less than 40% of attackPower, take
that kill before running alignment logic.

Rationale: alignment scoring rewards shape (three-in-a-row toward a target),
not free territory. A 0.5-strength enemy on a flank is essentially free
land + opponent regrowth denial that the parent might leave alone for
several ticks while it pushes the aligned direction. Snapping it up for
~1.0 strength while keeping 60%+ of our forces behind costs almost nothing
relative to the alignment push (which can resume next tick at near-full
power thanks to the high-prod regrowth from the maxed move tech).

Edge case: when no cheap kill exists, falls through to parent's act,
preserving its dominant-in-season-29 behavior.

Tunable: CHEAP_KILL_RATIO. 0.4 picks up sub-2-strength enemies for a
typical full army (~5 attackPower); raising it would steal more kills
at the cost of disrupting alignment more often.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army) {
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return Conqueror.act(army);
    const tile = army.tile;
    if (!tile) return Conqueror.act(army);
    const neighbors = tile.neighbors;
    if (!neighbors) return Conqueror.act(army);

    const pid = army.player.id;
    const cheapThreshold = sLimit * CHEAP_KILL_RATIO;
    let bestTarget = null;
    let bestCost = Infinity;

    for (let k = 0; k < 4; k++) {
      const t = neighbors[k];
      if (!t) continue;
      let hasFriendly = false;
      let enemy = 0;
      const armies = t.armies;
      for (let i = 0; i < armies.length; i++) {
        const a = armies[i];
        if (a.player.id === pid) {
          hasFriendly = true;
          break;
        }
        enemy += a.strength;
      }
      if (hasFriendly || enemy <= 0) continue;
      const needed = enemy / BONUS + 0.6;
      if (needed > cheapThreshold) continue;
      if (needed < bestCost) {
        bestCost = needed;
        bestTarget = t;
      }
    }

    if (bestTarget) {
      army.attack(bestTarget, bestCost);
      return;
    }
    return Conqueror.act(army);
  },
};
