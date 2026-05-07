import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Parent Conqueror_g4_1f6790 dominated season #16, so there are no
// recent losses to dissect. The parent's edge over Conqueror_g1 is a
// single change: a pre-scan picking the strongest beatable adjacent
// enemy and killing it with minimum overkill before deferring to
// Conqueror. That edge is unconditional — once a beatable adjacent
// enemy exists, g4 commits the kill regardless of the broader threat
// picture on the tile's other cardinals.
//
// That unconditional commit can hand us a Pyrrhic kill. Suppose we
// have strength S, a beatable enemy E1 on one cardinal, and a larger
// (possibly unbeatable) enemy E2 on another. We send `E1/1.4 + 0.6`
// to kill E1, leaving `S - E1/1.4 - 0.6` behind. If E2 then attacks
// next tick at roughly `(E2 - 1) * BONUS` effective strength (typical
// garrison ~1, attackerBonus 1.4), our remainder may not hold the
// tile — and we just spent a turn capturing one cell to lose another.
// Strongest-beatable doesn't fix this: the *strongest* may be E2 only
// if E2 is itself beatable; when E2 is unbeatable, g4 still commits
// to E1 and walks straight into the counter.
//
// The fix is a single defensive guard right before `army.attack`: peek
// at the max enemy strength across the OTHER three cardinals (using
// the per-tile sums we already gathered in the kill-target scan) and
// abort the kill if a full-force counter from that cardinal would
// overrun what we leave behind. On abort we defer to Conqueror, which
// has its own alignment kernel and can pick a friendly rebalance or
// just hold rather than expose the tile.
//
// In clean 1v1-adjacency cases (the matchups where g4 already wins)
// the guard never triggers — there's no "other" enemy to abort on,
// so behaviour is identical to g4. The guard only changes behaviour
// in multi-front situations where g4's unconditional kill was the
// problem. Tech 90/0/2/4/4 is preserved (still the GA optimum from
// the parent lineage).
export default {
  name: "Conqueror_g5_d70030",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 with a defensive guard: skip the kill if a different adjacent enemy would overrun the remainder.",
  summary: `g4's strongest-beatable-adjacent kill priority is sound but
unconditional: once a beatable enemy is adjacent, g4 commits the kill
regardless of what sits on the other three cardinals. That can be a
Pyrrhic kill — we capture one cell and lose this one to a larger
adjacent enemy's counter next tick.

This descendant adds one defensive guard right before army.attack.
After computing 'needed' for the chosen kill, peek at the maximum
enemy strength across the OTHER cardinals (re-using the per-tile
scan already done) and estimate the counter-attack's effective
strength as (maxOther - 1) * BONUS — typical garrison ~1, the
engine's attackerBonus is 1.4. If our post-attack remainder can't
survive that counter, abort the kill and defer to Conqueror's
alignment kernel, which can rebalance with a friendly or hold.

Why this should not regress g4 in its winning matchups: in clean
1v1-adjacency situations there IS no other adjacent enemy, so the
guard never trips and behaviour is byte-identical to the parent.
The guard only changes behaviour in genuine multi-front pressure —
exactly where g4's unconditional commit was the failure mode.
Tech preserved at 90/0/2/4/4 (GA optimum).`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
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
    let bestEnemy = -1;
    let bestNeeded = 0;
    const enemyAt = [0, 0, 0, 0];
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
      enemyAt[i] = enemy;
      const needed = enemy / BONUS + 0.6;
      if (needed > sLimit) continue;
      if (enemy > bestEnemy) {
        bestEnemy = enemy;
        bestTile = t;
        bestNeeded = needed;
      }
    }

    if (bestTile) {
      // Defensive guard: a counter-attack from any other cardinal
      // arrives at roughly (enemy - 1) * BONUS effective strength.
      // If our remainder can't survive that, defer.
      const remaining = army.strength - bestNeeded;
      let maxOther = 0;
      for (let i = 0; i < 4; i++) {
        if (neighbors[i] === bestTile) continue;
        const e = enemyAt[i];
        if (e > maxOther) maxOther = e;
      }
      if ((maxOther - 1) * BONUS >= remaining) {
        Conqueror.act(army, game);
        return;
      }
      army.attack(bestTile, bestNeeded);
      return;
    }
    Conqueror.act(army, game);
  },
};
