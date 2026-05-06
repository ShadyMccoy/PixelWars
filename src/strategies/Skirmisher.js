const BONUS = 1.4;

export default {
  name: "Skirmisher",
  author: "shady",
  version: 1,
  description: "Bites the weakest beatable adjacent enemy with minimum force; otherwise drifts into empty space.",
  summary: `Hunter family thesis taken to the extreme: never overcommit. We scan
the four neighbors for the weakest enemy we can kill with the 1.4x
attacker bonus and send exactly enemy/1.4 + 0.6 strength — just enough
to take the tile and leave a token defender. The remainder stays home
to regrow and bite again next tick. If nothing winnable is adjacent we
drift into an empty neighbor (free expansion); if every neighbor is a
friendly or an enemy we cannot beat, we sit and stockpile.

The thesis: chip damage compounds. Conqueror picks the *strongest*
beatable enemy because the swing is bigger; Skirmisher picks the
*weakest* because every attack has to land cleanly with strength to
spare. We never bleed half our force on a misjudged breakthrough, and
the leftover at home means every capture is immediately reinforceable.

Expected to do well against Crusader-style aggressors that bring
strength forward in chunks (we eat the trailing weak tiles), and badly
against bots that keep all their tiles at parity (we have no soft
target to chip).`,
  act(army) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    let bestEnemyTile = null;
    let bestEnemy = Infinity;
    let bestEmpty = null;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) {
        if (bestEmpty === null) bestEmpty = t;
        continue;
      }
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly || enemy <= 0) continue;
      // Beatable check uses the same minimum-kill formula as Conqueror.
      if (enemy / BONUS + 0.6 > sLimit) continue;
      if (enemy < bestEnemy) { bestEnemy = enemy; bestEnemyTile = t; }
    }

    if (bestEnemyTile) {
      army.attack(bestEnemyTile, bestEnemy / BONUS + 0.6);
      return;
    }
    if (bestEmpty) {
      army.attack(bestEmpty, sLimit);
    }
    // No beatable enemy and no empty tile: stockpile.
  },
};
