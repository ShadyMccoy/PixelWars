import Conqueror from "./Conqueror.js";

const BONUS = 1.4;

export default {
  name: "Hammer",
  author: "claude",
  version: 1,
  description:
    "Adjacent-only over-commit: pick the strongest beatable enemy and dump max attackPower (clamped by budget) instead of Conqueror's minimum-overkill formula. Lanchester rewards the surplus.",
  summary: `Conqueror's chassis commits exactly enemy/1.4 + 0.5
strength to a kill — calibrated for linear combat, where overkill
earns nothing. Under combatModel="lanchester" that formula becomes
a strict under-commit: post-fight survivor effective strength is
sqrt(W^2 - L^2), so a 2x ratio is ~4x more efficient than 1.01x.
Min-overkill leaves the survivor at ~0 strength, then the
budget-clamping in budget mode means even that survivor is
underfunded for follow-up moves.

Hammer ignores the closed-form commit math entirely. For each
adjacent direction it picks the best beatable enemy by enemy
strength + a small backing/territory bonus, then fires
attackPower (full available, clamped automatically by the engine
to budget). Under Lanchester this is rarely wasteful: any
"overkill" returns as more raw strength preserved on the
captured tile. Under budget mode, sending more than the budget
allows is a no-op (engine clamps), so there's no downside to
asking for max.

Per army:
  1. Scan 4 neighbors for any beatable enemy. Beatable =
     attackPower * atkMult * BONUS > enemy_strength * 1.05 (small
     safety margin against Lanchester near-tie annihilation).
  2. Among beatable enemies, pick the one with the highest
     (enemy_strength + 0.4 * adjacent_friendly_strength) — kills
     a bigger threat with more friendly support, mirroring
     Conqueror's hemisphere bias but without the kernel cost.
  3. Commit attackPower (the engine's budget clamp does the rest).
  4. No beatable adjacent enemy: fall through to Conqueror.act
     for stencil-based moves.

Tech is brutally offensive: {move:30, stack:0, prod:20, atk:40,
def:10}. atk:40 is much higher than the lineage's typical 4-5
because Lanchester rewards atk multiplicatively in the ratio:
high atk means our effective W is much larger than the
defender's L, and sqrt(W^2 - L^2) approaches W — we keep almost
all our raw strength after winning. move:30 (1.2x recharge +
1.2x cap) is enough for adjacent-only play. prod:20 keeps
strength replenishing. def:10 buys some durability on the rare
tick we can't kill first.

Expected to crush bots that under-commit (every classic-tuned
Conqueror). Expected to lose to other over-commit bots whose
strength regen keeps up better, or to ranged bots (Sniper) that
exploit Hammer's adjacent-only horizon.`,
  tech: { move: 60, stack: 0, prod: 10, atk: 20, def: 10 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const atkMult = (army.player.techMults?.atk ?? 1) * BONUS;
    const myEff = sLimit * atkMult;

    let bestKill = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 4; i++) {
      const t = neighbors[i];
      if (!t) continue;
      const tArmies = t.armies;
      if (tArmies.length === 0) continue;
      let friendly = false;
      let enemy = 0;
      for (let k = 0; k < tArmies.length; k++) {
        const a = tArmies[k];
        if (a.player.id === pid) { friendly = true; break; }
        enemy += a.strength;
      }
      if (friendly) continue;
      // Need to overwhelm with margin under Lanchester: if myEff is
      // only slightly above enemy, sqrt(myEff^2 - enemy^2) ~ 0 and
      // we trade for nothing. 1.05x margin avoids the near-tie
      // annihilation zone.
      if (myEff <= enemy * 1.05) continue;

      // Backing bias: prefer kills supported by adjacent friendly
      // strength on neighbors of the target.
      let backing = 0;
      const tn = t.neighbors;
      for (let j = 0; j < 4; j++) {
        const nt = tn[j];
        if (!nt || nt === tile) continue;
        const ntArmies = nt.armies;
        for (let k = 0; k < ntArmies.length; k++) {
          const a = ntArmies[k];
          if (a.player.id === pid) backing += a.strength;
        }
      }

      const score = enemy + 0.4 * backing;
      if (score > bestScore) {
        bestScore = score;
        bestKill = t;
      }
    }

    if (bestKill) {
      // Commit max — engine clamps to budget. Lanchester preserves
      // surplus as raw strength on the captured tile.
      army.attack(bestKill, sLimit);
      return;
    }

    // No beatable adjacent enemy — defer for stencil expansion.
    Conqueror.act(army, game);
  },
};
