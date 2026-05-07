import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const FRONT_WEIGHT = 0.3;

// Parent Conqueror_g4_1f6790 dominated season #49 with no recorded
// losses. Its kill-priority rule is "strongest beatable adjacent
// enemy first", scored by raw enemy strength on the target tile.
//
// Refinement, not redirection: keep the parent's whole structure
// (cardinal pre-scan, beatability gate, minimum-overkill cost,
// Conqueror fallback) and only sharpen the tiebreak. Promote the
// pick from raw strength to threat-weighted strength:
//
//   score = enemy_strength * (1 + FRONT_WEIGHT * friendly_front_count)
//
// where `friendly_front_count` is how many of the enemy tile's four
// cardinal neighbors hold one of our armies. The parent's own notes
// motivate this directly — it called out "Membrane stalls came from
// one enemy stack growing on the border" and chose strongest-first
// as "the strictly defensive read" because a growing stack threatens
// every adjacent tile of ours simultaneously. Raw strength is a
// proxy for that threat; friendly-front-count measures it directly.
// An enemy touching three of our tiles will, next turn, pressure
// three of our tiles via growth and movement, so it is effectively
// stronger than the same-strength enemy touching only one.
//
// FRONT_WEIGHT is 0.3 deliberately. With 1.0/1.3/1.6/1.9/2.2 as the
// per-front multipliers, a clearly bigger single-front enemy still
// wins (2.0*1.3=2.6 beats 1.5*1.9=2.85? actually 2.85 wins — and
// that's the desired outcome: the borderline-tied multi-front threat
// gets prioritized; a much bigger enemy still wins outright).
//
// Cost / overkill / fallback are unchanged, so the move-heavy
// reserve thesis (90/0/2/4/4) and the alignment kernel under it
// keep doing exactly what they did in season #49. This is a single,
// localized tweak to the kill-target tiebreak.
export default {
  name: "Conqueror_g5_5a9922",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 with multi-front threat weighting on adjacent kill priority.",
  summary: `Parent g4 picks the strongest beatable adjacent enemy
and falls through to Conqueror's alignment kernel otherwise. The
pick is by raw enemy strength. Refine: score the candidate kills as
enemy_strength * (1 + 0.3 * friendly_count_touching_enemy_tile).
Same beatability gate, same cost (enemy/1.4 + 0.6), same fallback —
only the tiebreak on "which enemy" changes. Motivation comes from
the parent's own thesis ("Membrane stalls were one enemy stack
growing on the border"): a stack adjacent to multiple of our tiles
pressures all of them via growth, so it is effectively stronger
than its raw strength suggests. The 0.3 weight is small enough that
a clearly larger single-front enemy still wins; only borderline
ties get resolved toward the multi-front threat. Reserve thesis,
overkill margin, and Conqueror fallback are preserved verbatim, so
the move-heavy alignment-kernel play that won season #49 is
unchanged in every situation other than which adjacent enemy gets
killed when more than one is beatable.`,
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

      // Count our armies touching the enemy tile (multi-front pressure).
      const enemyNeighbors = t.neighbors;
      let frontCount = 0;
      for (let j = 0; j < 4; j++) {
        const tn = enemyNeighbors[j];
        if (!tn) continue;
        const tnArmies = tn.armies;
        for (let m = 0; m < tnArmies.length; m++) {
          if (tnArmies[m].player.id === pid) { frontCount++; break; }
        }
      }
      const score = enemy * (1 + FRONT_WEIGHT * frontCount);
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
