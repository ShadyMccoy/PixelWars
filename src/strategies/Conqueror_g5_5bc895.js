import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const THREAT_WEIGHT = 0.25;

// Parent g4 added a strongest-beatable-adjacent-enemy kill priority
// to Conqueror, motivated by Membrane stalls where one growing enemy
// stack tipped the match. That heuristic measures threat purely as
// strength. But two enemies of equal strength can pose very different
// threats: one bordered by 3 of my tiles can attack 3 different
// fronts next turn (or grow protected by my surroundings if it's
// holding ground), while an isolated stack threatens just one.
//
// We refine g4 by scoring beatable adjacent enemies as
//   enemy_strength * (1 + 0.25 * friendly_adjacency_count).
// In homogeneous frontiers (most tiles equally exposed) this reduces
// to g4's strongest-first ordering. In ragged frontiers it picks the
// stack that's deepest into my territory — the multi-front threat —
// over an equally-sized stack on the open edge. Coefficient 0.25 is
// deliberately small: a 4-friendly-adj enemy gets a 2x score boost,
// which only flips the choice when strengths are within a factor of
// two. Stronger isolated enemies still win.
//
// Everything else is unchanged from g4: minimum-overkill sizing
// (enemy/1.4 + 0.6) preserves the move-heavy reserve thesis, and the
// fallback defers to Conqueror's GA-discovered alignment kernel.
export default {
  name: "Conqueror_g5_5bc895",
  author: "claude",
  version: 1,
  description: "g4 with threat-weighted kill priority: prefers beatable enemies that border more of my own tiles.",
  summary: `g4 ranks beatable adjacent enemies by raw strength, which
treats positional threat as a constant. We weight strength by how
many of my tiles the enemy borders (its fanout) so multi-front
threats are killed before equally-sized but isolated enemies. The
0.25 coefficient is small enough that strength still dominates the
ordering on homogeneous frontiers, only flipping when the strength
gap is under ~2x. Sizing and fallback unchanged from g4. Tech
matches the parent's 90/0/2/4/4 GA optimum.`,
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

      let friendlyAdj = 0;
      const tn = t.neighbors;
      for (let j = 0; j < 4; j++) {
        const u = tn[j];
        if (!u) continue;
        const ua = u.armies;
        for (let k = 0; k < ua.length; k++) {
          if (ua[k].player.id === pid) { friendlyAdj++; break; }
        }
      }

      const score = enemy * (1 + THREAT_WEIGHT * friendlyAdj);
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
