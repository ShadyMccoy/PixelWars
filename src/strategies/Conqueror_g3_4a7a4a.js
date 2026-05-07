import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const OVERKILL_MARGIN = 0.5;

// Descendant of Conqueror_g2_5908df. Parent dominated its season,
// so the strategy structure (Pass 1 strongest-beatable kill, Pass 2
// fall-through to Conqueror's kernel) is kept intact. Two tunings:
//
// 1) Overkill margin trimmed from 0.6 -> 0.5. The transferred
//    power is `enemy / BONUS + margin`. After winning the pairwise
//    cancel, the captured tile retains `margin * BONUS` strength —
//    0.84 at margin 0.6, 0.7 at margin 0.5. 0.7 still clears the
//    > 0.5 attack-validity floor for the smallest possible enemy
//    (E~0 -> power 0.5+, edge case guarded by Math.max), and the
//    extra 0.1 stays on the source tile so the next tick's grow
//    starts from a higher base. Net throughput buff with no kill
//    rate change.
//
// 2) Tech shifts 5 points from move to atk and 2 from def... wait,
//    parent had atk=10/def=8 (sum 18). New split is
//    {move:75, stack:0, prod:2, atk:13, def:10} = 100. Garrison
//    floor moves 0.7 -> 0.75 (still a big throughput edge over the
//    1.3 neutral). atk climbs from 10 to 13, def from 8 to 10 —
//    both closer to the 20-point baseline anchor. Parent's note
//    flagged atk/def staying sub-baseline as the residual cost of
//    the move-heavy build; this descendant reclaims a chunk of
//    that without giving back the garrison advantage.
export default {
  ...Conqueror,
  name: "Conqueror_g3_4a7a4a",
  description: "Conqueror_g2 tuned: lower overkill, atk/def closer to baseline.",
  summary: `Same kill-then-flock skeleton as Conqueror_g2_5908df.
Pass 1: scan all 4 neighbors and attack the strongest beatable
adjacent enemy with overkill margin trimmed from 0.6 to 0.5
(captured tile retains 0.7 strength instead of 0.84, freeing 0.1
on the source). Pass 2: fall through to plain Conqueror.act for
kernel-aligned territory expansion. Tech shifts to
{move:75, stack:0, prod:2, atk:13, def:10}: garrison floor 0.75
(0.05 worse than parent), atk and def each +3 / +2 toward the
baseline-20 anchor. Bet: parent dominated season #30 so we keep
the structure, and reclaim a bit of per-fight efficiency at a
small garrison cost.`,
  tech: { move: 75, stack: 0, prod: 2, atk: 13, def: 10 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    // Pass 1: strongest beatable adjacent enemy.
    let bestKill = null;
    let bestEnemy = -1;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      const needed = enemy / BONUS + OVERKILL_MARGIN;
      if (needed > sLimit) continue;
      if (enemy > bestEnemy) {
        bestEnemy = enemy;
        bestKill = t;
      }
    }
    if (bestKill) {
      // Floor at 0.55 to clear the engine's > 0.5 attack-validity
      // gate when bestEnemy is tiny.
      const power = Math.max(bestEnemy / BONUS + OVERKILL_MARGIN, 0.55);
      army.attack(bestKill, power);
      return;
    }

    // Pass 2: Conqueror's kernel-based territory logic.
    Conqueror.act(army, game);
  },
};
