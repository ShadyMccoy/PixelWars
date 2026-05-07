import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.5;
const MIN_ATTACK = 0.55;

// Parent Conqueror_g4_1f6790 dominated season #45 with no recorded
// losses. Structure is sound; the only obvious slack is the
// conservative +0.6 overkill margin. Tighten it to +0.5 (with a
// 0.55 floor so the engine's `power > 0.5` validity check still
// passes for very weak enemies). Each kill leaves ~0.1 more
// strength in the home reserve, which compounds in the move-heavy
// 90/0/2/4/4 build the lineage runs — that thesis is precisely
// "more reserve, more flex" so any margin we can shave goes
// straight into the strategy's strong suit.
//
// Second, a tie-break for the strongest-beatable pick: when two
// adjacent enemy tiles carry equal total strength, prefer the one
// with MORE armies on it. A 2-stack cluster has more strategic
// disruption value than a single fat army of the same total —
// breaking a cluster removes two production sources, vs one for
// the lone-fat case. Strongest-beatable (g4's core thesis) is
// preserved as the primary key; cluster count is only a tie-break.
//
// Tech is unchanged — 90/0/2/4/4 was the GA optimum the lineage
// converged on and the parent's character results are still strong.
export default {
  name: "Conqueror_g5_6e396f",
  author: "claude",
  version: 1,
  description:
    "Conqueror_g4 with tighter overkill margin (+0.5 vs +0.6, 0.55 floor) and a cluster-count tie-break on strongest-beatable picks.",
  summary: `g4 dominated season #45 with no losses — the strongest-
beatable-adjacent kill plus Conqueror fallback is the right shape.
The remaining slack is the conservative +0.6 overkill margin: the
post-combat winner only needs E/1.4 + epsilon to clear an enemy
of strength E, so dropping the margin to +0.5 saves ~0.1 strength
per kill that would otherwise sit unused on the captured tile.
A 0.55 floor (Math.max) keeps every commit above the engine's
0.5 attack-validity threshold even when the enemy is tiny.

Why this matters more here than for a stack-heavy bot: the lineage
runs 90/0/2/4/4 — a move-heavy thesis whose whole point is that
spare strength sits in the home reserve and gets routed where
needed. Anything that adds reserve compounds. 0.1 per kill across
a match is small individually, exactly the slow steady edge a
dominant lineage needs to keep climbing.

Tie-break: when two adjacent enemies tie on total strength, prefer
the tile with more armies. Breaking a 2-stack removes two growth
points; killing one fat army removes one. Strongest-beatable stays
the primary key (g4's anti-Membrane logic is intact); the tie-break
just resolves the cases where g4 picked deterministically by
neighbor-array order.`,
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
    let bestCount = 0;
    let bestNeeded = 0;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const armies = t.armies;
      if (armies.length === 0) continue;
      let friendly = false;
      let enemy = 0;
      let count = 0;
      for (let k = 0; k < armies.length; k++) {
        const a = armies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
        count++;
      }
      if (friendly || enemy <= 0) continue;
      const needed = Math.max(MIN_ATTACK, enemy / BONUS + MARGIN);
      if (needed > sLimit) continue;
      if (enemy > bestEnemy || (enemy === bestEnemy && count > bestCount)) {
        bestEnemy = enemy;
        bestCount = count;
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
