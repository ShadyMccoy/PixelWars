import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const REACH_WEIGHT = 0.5;

// Pure tech-only descendant of the top-rated Conqueror,
// Conqueror_g5_b3b641 (rating ~1326). Kernel byte-for-byte
// identical to the parent (reach-weighted strongest-beatable
// kill, then Conqueror.act fallthrough). Only the tech swaps.
//
// Parent's tech is 90/0/2/4/4 — move-heavy GA optimum, but
// atk and def both deep below the 20-anchor (sub-1.0× per-fight
// multipliers). This descendant pours the entire budget into
// the three multiplier knobs: prod=34, atk=33, def=33, with
// move=0 and stack=0. Per-fight outcomes get ~1.3× atk, ~2× def,
// and tiles refill ~1.7× faster than neutral; the cost is a
// garrison floor of 1.5 (vs 0.6 at move=90), substantially
// reducing per-tile attackPower.
//
// Earlier sibling Conqueror_g10_ed740d ran the same tech on the
// vanilla Conqueror kernel and landed near median (~994). The
// hypothesis here is that the parent's reach-weighted kill
// priority — which prefers beatable enemies that threaten our
// cluster — is exactly the kind of high-leverage decision that
// benefits most from the prod/atk/def buffs: the chosen kill
// becomes more reliable, and the cluster behind it heals back
// faster.
export default {
  name: "Conqueror_g6_159029",
  author: "claude",
  version: 1,
  description: "Conqueror_g5_b3b641 kernel verbatim with prod/atk/def-maxed tech (0/0/34/33/33).",
  summary: `Top-rated Conqueror_g5_b3b641 (~1326) verbatim, tech only.
Parent's 90/0/2/4/4 (move-heavy, sub-baseline atk/def) becomes
0/0/34/33/33: every point on the multiplier knobs.

Kernel preserved: reach-weighted strongest-beatable-kill pre-pass
(score = enemy_strength + 0.5 × friendly_strength_in_enemy_neighbors),
falling through to Conqueror.act when no kill is available.

Cost: garrison floor jumps from 0.6 to 1.5 (move=0), so
attackPower per tile drops noticeably. Bet: the parent's
high-leverage kill pick benefits more from atk≈1.3× and def≈2×
than it suffers from the lower attackPower budget — and prod≈1.7×
heals the cluster back between trades.`,
  tech: { move: 0, stack: 0, prod: 34, atk: 33, def: 33 },
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
    let bestScore = -1;
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

      let friendlyReach = 0;
      const enbrs = t.neighbors;
      for (let n = 0; n < 4; n++) {
        const nt = enbrs[n];
        if (!nt) continue;
        const na = nt.armies;
        for (let k = 0; k < na.length; k++) {
          const a = na[k];
          if (a.player.id === pid) friendlyReach += a.strength;
        }
      }
      const score = enemy + REACH_WEIGHT * friendlyReach;
      if (score > bestScore) {
        bestScore = score;
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
