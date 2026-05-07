import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Parent Conqueror_g4_1f6790 added a strongest-beatable adjacent kill
// pass on top of Conqueror, but its scan skips any tile with a
// friendly on it (`if (friendly) break`). That correctly excludes
// pure-friendly tiles, but it ALSO excludes *contested* tiles —
// tiles holding both a friendly army and an enemy. Those are exactly
// the tiles where our reinforcement matters most: end-of-tick
// resolution does pairwise cancellation, so adding strength to the
// friendly side can flip a losing fight.
//
// Lost-tile failure mode in the season #39 loss to Conqueror_g6_aa7266:
// once an enemy lands on one of our tiles, the parent's adjacent
// armies treat it as "friendly present, skip" and move on to other
// targets. The friendly garrison alone may be too small to repel
// (BONUS=1.4 favors the attacker), and the tile flips. Next tick the
// situation is worse: the former friendly tile is now a strong
// enemy stack, possibly above our attackPower entirely.
//
// Fix: before the strongest-kill pass, check the four neighbors for
// contested tiles. If a friendly there would lose the fight without
// us (friendlyStr * BONUS < enemyStr) BUT win it with our committed
// sLimit added in (friendlyStr + sLimit reinforcement, then * BONUS
// > enemyStr), we send sLimit there. We don't reinforce contested
// tiles that would already be won (waste of strength) or that we
// couldn't save anyway (still lose with us → strength better spent
// on offense / refilling).
//
// Strongest-kill remains Pass 1 unchanged. Conqueror.act remains the
// final fallback. Tech is held at the cousin-lineage optimum
// {90,0,2,4,4}; the proven {move:20...} neutral that the engine
// currently runs the parent on still applies if the descendant tech
// is overridden at registration.
export default {
  name: "Conqueror_g5_25aa91",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 + reinforce contested adjacent friendlies that we can save.",
  summary: `Parent Conqueror_g4_1f6790 scans adjacent tiles for the
strongest beatable enemy and kills it; otherwise defers to
Conqueror.act. The scan skips any tile containing a friendly army,
which silently excludes *contested* tiles (friendly + enemy on the
same tile) from consideration. Those tiles are the most defensively
critical: end-of-tick pairwise cancellation means our reinforcement
can flip a losing fight, but if we ignore them the friendly garrison
fights alone against attackerBonus=1.4 and often loses, after which
the former friendly tile is a strong enemy stack we may no longer be
able to retake.

This descendant adds a Pass 0 that triages contested neighbors. For
each one we compute the resolution outcome with and without us
joining: if the friendly would lose without us (friendlyStr*BONUS <
enemyStr) AND would win with us added (friendlyStr+sLimit then *
BONUS > enemyStr), we commit our entire attackPower to that tile.
Unwinnable saves (still lose with us) and already-winning saves
(waste) are skipped. We pick the save with the largest swing in
expected resolution, since that's the one where our marginal
contribution does the most work.

Strongest-kill (Pass 1) and Conqueror.act fallback are unchanged. No
tech change: {90,0,2,4,4} is the cousin-lineage anchor.`,
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

    // Pass 0: rescue a contested friendly we can flip from loss to win.
    let bestSave = null;
    let bestSwing = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length < 2) continue;
      let friendlyStr = 0;
      let enemyStr = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) friendlyStr += a.strength;
        else enemyStr += a.strength;
      }
      if (friendlyStr <= 0 || enemyStr <= 0) continue;
      const without = friendlyStr * BONUS - enemyStr;
      if (without >= 0) continue; // friendly already wins, don't waste strength
      const withMe = (friendlyStr + sLimit) * BONUS - enemyStr;
      if (withMe <= 0) continue; // even with us, friendly still loses
      const swing = withMe - without;
      if (swing > bestSwing) {
        bestSwing = swing;
        bestSave = t;
      }
    }
    if (bestSave) {
      army.attack(bestSave, sLimit);
      return;
    }

    // Pass 1: strongest beatable adjacent enemy (parent's behavior).
    let bestTile = null;
    let bestEnemy = -1;
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
      if (enemy > bestEnemy) {
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
