import { balanceAttack } from "./helpers.js";

export default {
  name: "Coastal",
  author: "claude",
  version: 1,
  description:
    "Frontier-only actor: armies surrounded by friendlies sit and grow; armies on the border push hard with full surplus.",
  summary: `Two-tier deployment. Coastal classifies each army by whether
it touches the edge of our territory — if every neighbor is a
friendly-occupied tile of our own, the army is *interior* and does
nothing. Interior strength accumulates passively until a neighbor
flips (we lose a tile, or a friendly army moves out), at which point
the now-frontier army flushes into the gap.

Frontier behavior is intentionally aggressive: balanceAttack against
the weakest neighbor (matching SlowAndSteady's controlled pressure),
but with a permission to commit attackPower against any beatable
enemy stack — interior armies will keep feeding strength forward, so
frontier armies don't need to hoard.

Why this works: the standard "skip when low strength" pattern (Cautious)
under-utilizes any army that *happens* to be at low strength even
when it's the only thing standing between an enemy and our base. The
better signal is *position*, not strength. An interior army at 4
strength is wasted; a frontier army at 4 strength is the front line.

Tier rules per army:
- Friendly count = number of neighbors occupied by our own armies.
- Interior (friendly count == valid-neighbor count): hold.
- Frontier: among non-friendly neighbors, attack the one with least
  enemy presence (empty preferred at flat 1.2; enemy via balanceAttack;
  beatable strong enemy via attackPower if margin > 1.5).

Weak against: turtles that pack the same map quadrant with us — if
every neighbor is friendly we never act, and a slow-rolling enemy
elsewhere snowballs uncontested.
Strong against: scattered/dispersed pools where every Coastal army
sits exactly on the boundary by the mid-game and can punch outward
in concert.`,
  act(army) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;

    let validCount = 0;
    let friendlyCount = 0;
    let bestEmpty = null;
    let weakestEnemyTile = null;
    let weakestEnemyStr = Infinity;
    let strongBeatable = null;
    let strongBeatableStr = 0;

    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      validCount++;
      const armies = t.armies;
      if (armies.length === 0) {
        if (!bestEmpty) bestEmpty = t;
        continue;
      }
      let enemy = 0;
      let friendly = false;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly) {
        friendlyCount++;
        continue;
      }
      if (enemy < weakestEnemyStr) {
        weakestEnemyStr = enemy;
        weakestEnemyTile = t;
      }
      if (enemy + 1.5 < army.strength && enemy > strongBeatableStr) {
        strongBeatableStr = enemy;
        strongBeatable = t;
      }
    }

    if (validCount === 0) return;
    if (friendlyCount === validCount) return;

    if (bestEmpty && army.strength > 2.5) {
      army.attack(bestEmpty, 1.2);
      return;
    }
    if (strongBeatable) {
      army.attack(strongBeatable, army.attackPower);
      return;
    }
    if (weakestEnemyTile) {
      balanceAttack(army, weakestEnemyTile);
    }
  },
};
