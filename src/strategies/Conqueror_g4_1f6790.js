import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

// Parent Conqueror_g3_51d626 lost head-to-head to Conqueror_g1_879a88
// (twice, season #6) and stalled vs Membrane_g1_b9f1d5 / Crusader.
//
// Re-reading the parent's fallback: it fires only when
// `hasAdjacentTarget=false`, which by definition means every cardinal
// neighbor is either a full friendly (no room to balance into) or an
// unbeatable enemy (`enemy/1.4 + 0.6 > sLimit`). Both 1-step targets
// the parent's `tryCommit` could pick are exactly those — so the
// fallback's primary AND secondary commits are guaranteed to return
// false. The g3 5x5 fallback is dead code; it never issues an attack.
// Strip it: the parent reduces to Conqueror with the GA-discovered
// move-heavy tech, i.e. Conqueror_g1_879a88. That explains the noise-
// dominated head-to-head losses to its simpler ancestor.
//
// To do better than Conqueror_g1, borrow Crusader's idea — Crusader
// is what beat the parent in seed=181 by patching Trinity's "missed
// adjacent kill" hole. Conqueror has the same hole: it iterates
// directions by alignment kernel score, so a beatable adjacent enemy
// in a low-alignment direction loses priority to a friendly-rebalance
// in a high-alignment one. We pre-scan for the strongest beatable
// adjacent enemy and kill it first (with Conqueror-style minimum-
// overkill, NOT Crusader's all-in, to keep the move-heavy reserve
// thesis intact). Otherwise we defer to Conqueror unchanged.
//
// Why "strongest" not "weakest": Membrane stalls came from one enemy
// stack growing on the border. Defanging the biggest local threat is
// the strictly defensive read; weakest-first leaves the threat to
// snowball. Tech unchanged — 90/0/2/4/4 is still the GA optimum.
export default {
  name: "Conqueror_g4_1f6790",
  author: "claude",
  version: 1,
  description: "Conqueror_g3's dead fallback removed; adds Crusader-style strongest-beatable-adjacent-enemy kill priority.",
  summary: `g3's 5x5 fallback was dead code: it only ran when every
neighbor was unbeatable-enemy or full-friendly, and tryCommit refuses
both. So g3 ≡ Conqueror_g1 in practice, and losing head-to-head to
g1 was just variance. To improve, lift Crusader's pattern onto
Conqueror: scan the four cardinal neighbors for the strongest
beatable enemy and kill it before falling through to Conqueror's
alignment kernel. Conqueror sorts by alignment, not by enemy
presence, so a beatable enemy in a side direction can lose priority
to a friendly-balance in a higher-aligned one - we patch that. Keep
Conqueror's minimum-overkill sizing (enemy/1.4 + 0.6) instead of
Crusader's all-in commit, so we still benefit from leftover reserves
in the move-heavy 90/0/2/4/4 build the parent lineage runs.
Strongest-beatable (not weakest) addresses the Membrane-pressure
stalls where one growing enemy stack tipped the match.`,
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
