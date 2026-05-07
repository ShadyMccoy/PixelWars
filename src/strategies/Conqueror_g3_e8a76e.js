import Conqueror from "./Conqueror.js";

const BASE_BONUS = 1.4;
const SAFETY = 0.6;

// Parent Conqueror_g2_5908df dominated season #30 with a kill-first hybrid
// (Pass 1: best beatable adjacent enemy at min-overkill; Pass 2: Conqueror
// kernel) and tech {move:80, stack:0, prod:2, atk:10, def:8}. No losses to
// react to, so the changes are tightening, not pivoting:
//
// 1. Tech-aware kill threshold. Parent's pass-1 formula `enemy / 1.4 + 0.6`
//    treats attack tech as neutral. With atk=10 the actual atkMult is
//    1.0 + (10 - 20) * 0.0030 = 0.97 (Tech.js SLOPES.atk = 0.0030,
//    BASELINE = 20), so the effective attacker bonus is 1.358 not 1.4.
//    Against a neutral-def opponent the 0.6 safety eats the slack, but
//    against any def-tech bot (defMult > 1) parent's threshold can pick
//    fights it then under-commits to. Compute eff = 1.4 * techMults.atk so
//    the threshold tracks whatever atk we end up running and the parent's
//    "minimum-overkill" rationale stays correct.
//
// 2. Drop prod=2 into atk. prod=2 has multiplier 1.0 + (2 - 20) * 0.0008 =
//    0.986 — barely visible per-tick. Reallocating to atk takes atk 10->12
//    (mult 0.97 -> 0.976). Tiny but free combat-throughput bump, and it
//    feeds (1) — every kill formula in the bot now uses the slightly
//    larger eff.
//
// Pass 2 is unchanged: fall through to Conqueror.act when no winnable
// adjacent kill exists. Same hybrid silhouette as the parent.
export default {
  ...Conqueror,
  name: "Conqueror_g3_e8a76e",
  description: "Conqueror_g2 + tech-aware kill threshold; prod=2 reallocated to atk.",
  summary: `Two tightenings on parent Conqueror_g2_5908df. (a) Kill threshold
uses 1.4 * techMults.atk instead of a hardcoded 1.4 — corrects a silent
under-estimate of strength-needed when atk-tech is sub-baseline (parent's
atk=10 -> mult 0.97 -> true bonus 1.358), so pass-1 picks fights it can
actually finish. (b) prod=2 (mult ≈ 0.986, near-invisible) reallocated to
atk: tech becomes {move:80, stack:0, prod:0, atk:12, def:8}, atk-mult
goes 0.97 -> 0.976. Pass 2 is verbatim Conqueror.act fall-through.
Targets close-margin pass-1 kills against def-tech bots that the parent's
fixed-1.4 divisor under-commits to.`,
  tech: { move: 80, stack: 0, prod: 0, atk: 12, def: 8 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    const atkMult = (army.player.techMults && army.player.techMults.atk) || 1;
    const eff = BASE_BONUS * atkMult;

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
      const needed = enemy / eff + SAFETY;
      if (needed > sLimit) continue;
      if (enemy > bestEnemy) {
        bestEnemy = enemy;
        bestKill = t;
      }
    }
    if (bestKill) {
      army.attack(bestKill, bestEnemy / eff + SAFETY);
      return;
    }

    // Pass 2: Conqueror kernel territory logic.
    Conqueror.act(army, game);
  },
};
