import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Conqueror_g4 inherited a 5x5 fallback whose tryCommit gate uses the
// same beatability threshold as the adjacent-target gate that precedes
// it. By the time the fallback runs, every neighbor is null,
// friendly-full, or unbeatable-enemy — exactly the cases tryCommit
// rejects. So the fallback never fires; a stalled army does nothing
// while neighboring enemy stacks tick up under their own production.
//
// Replace the dead branch with a chip-damage move: when stalled and an
// adjacent tile has an unbeatable enemy stack (the only reason a
// non-null neighbor would block adjacency without also being a
// reinforceable friendly), dump full attackPower into the weakest such
// stack. Engine math: power P delivers P*1.4 damage; the army survives
// at garrison strength and regrows. Trade ratio is BONUS=1.4 in our
// favor as raw strength, and the chipped stack often drops back into
// adjacent-beatable range for our next tick or for our other armies
// flanking the same target. If no enemy is adjacent (interior army
// surrounded by friendly-full tiles), chipDir stays -1 and we idle —
// same as parent.
//
// No loss data to draw on: parent dominated season #38 with no
// recorded losses, so this is exploration, not a fix. Hypothesis is
// that the dead-fallback ticks where parent stands idle are non-zero
// over a long match on lab1 (24x18 wrap, growth 1.8, maxArmy 6) and
// converting them into damage compounds.
export default {
  name: "Conqueror_g5_3d9064",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 with the dead stencil5 fallback replaced by a chip-damage move on the weakest unbeatable adjacent enemy.",
  summary: `Parent's stencil5 fallback is dead code: its tryCommit gate
duplicates the adjacent-target gate's beatability threshold, so every
neighbor that could pass tryCommit was already a viable adjacent
target one branch up. When the parent reaches the fallback, every
non-null neighbor is friendly-full or unbeatable-enemy and tryCommit
rejects all of them — the army idles.

This descendant keeps Conqueror.act as the workhorse (delegated
whenever any neighbor is empty/beatable/friendly-with-room) and
replaces the dead fallback with a chip move: throw full attackPower
at the weakest adjacent unbeatable enemy. The army does not die —
it shrinks to garrison and regrows — and the chipped enemy takes
power*1.4 damage. Often that drops the stack back into beatable
range for the next tick.

Guard: only chip if attackPower clears half of maxStrength, so we
don't waste a half-rebuilt army on a low-impact poke. Interior
armies surrounded by friendly-full tiles still idle (no enemy
adjacent to chip). Same tech as parent.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;

    let hasAdjacentTarget = false;
    let chipDir = -1;
    let chipEnemy = Infinity;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) {
        hasAdjacentTarget = true;
        continue;
      }
      let friendlyArmy = null;
      let enemy = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }
      if (enemy > 0) {
        const needed = enemy / BONUS + 0.6;
        if (needed <= sLimit) {
          hasAdjacentTarget = true;
        } else if (enemy < chipEnemy) {
          chipEnemy = enemy;
          chipDir = i;
        }
        continue;
      }
      if (friendlyArmy && friendlyArmy.strength < friendlyArmy.maxStrength - 0.5) {
        hasAdjacentTarget = true;
      }
    }
    if (hasAdjacentTarget) {
      Conqueror.act(army, game);
      return;
    }

    // Stalled: chip the weakest unbeatable adjacent enemy if we have
    // meaningful weight to throw. Guard at half maxStrength avoids
    // wasting a half-rebuilt army on a marginal poke.
    if (chipDir >= 0 && sLimit > 0.5 && sLimit >= army.maxStrength * 0.5) {
      army.attack(neighbors[chipDir], sLimit);
    }
  },
};
