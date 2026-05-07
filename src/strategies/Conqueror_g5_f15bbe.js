import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Parent (Conqueror_g4_1f6790) added a pre-scan that kills the
// STRONGEST beatable adjacent enemy before deferring to Conqueror's
// alignment kernel. The thesis was "defang Membrane-style snowballs
// by removing the biggest local threat first".
//
// This descendant flips that single bit: kill the WEAKEST beatable
// adjacent enemy instead. The kill cost in this lineage is
// `enemy / 1.4 + 0.6`, i.e. linear in enemy strength. So:
//
//   strongest-first: big spike of strength spent, then long regrow.
//                    During regrow we are at the garrison floor and
//                    cannot threaten anything.
//   weakest-first:   shallow dip, near-full reserves preserved.
//                    We can still react to a stencil-2 enemy that
//                    arrives next tick, or commit to an alignment-
//                    driven expansion via Conqueror's fallback when
//                    no beatable enemy exists.
//
// Both variants kill every beatable adjacent enemy within a few
// ticks (the parent observed no recent losses, so neither variant
// is leaking territory). The differentiator is the reserve
// trajectory between kills. Higher reserves = more options =
// better play under noise. Membrane-stall mitigation still works:
// the weakest beatable enemy IS killed each tick, so no enemy
// stack is allowed to grow unmolested — we just don't burn our
// whole bar on the biggest one.
//
// Same minimum-overkill sizing (enemy/1.4 + 0.6) and same
// fallthrough to Conqueror.act, so the move-heavy formation thesis
// is intact. Tech inherited from the parent.
export default {
  name: "Conqueror_g5_f15bbe",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 with weakest-beatable adjacent enemy priority instead of strongest, to preserve reserves between kills.",
  summary: `g4 picked the STRONGEST beatable adjacent enemy each tick.
Kill cost is linear in enemy strength (enemy/1.4 + 0.6), so g4 spent
big bursts of strength on big targets, then sat near the garrison
floor regrowing — useless for the next tick. This descendant kills
the WEAKEST beatable adjacent enemy instead. Same end-state (every
beatable enemy dies within a few ticks), but the reserve floor stays
high between kills, which keeps us responsive to unexpected pressure
and keeps Conqueror's alignment kernel viable as a follow-up. The
Membrane-stall mitigation g4 cited still applies — we still kill an
enemy each tick — we just refuse to overcommit on the biggest one.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) {
      Conqueror.act(army, game);
      return;
    }
    const neighbors = tile.neighbors;
    const pid = army.player.id;

    let bestTile = null;
    let bestEnemy = Infinity;
    let bestNeeded = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      let friendly = false;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      const needed = enemy / BONUS + 0.6;
      if (needed > sLimit) continue;
      if (enemy < bestEnemy) {
        bestEnemy = enemy;
        bestTile = t;
        bestNeeded = needed;
      }
    }

    if (bestTile) {
      army.attack(bestTile, bestNeeded);
      return;
    }
    Conqueror.act(army, game);
  },
};
