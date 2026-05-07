import { sumStrength } from "../core/Army.js";
import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const MARGIN = 0.6;
const BACKING_WEIGHT = 0.4;

// For each cardinal direction (W=0, E=1, N=2, S=3) the list of
// stencil5 indices that lie strictly in that hemisphere. Excludes the
// orthogonal axis so the four hemispheres do not double-count cells
// directly above/below or beside us. Precomputed once at module load.
const HEMI = (() => {
  const w = [], e = [], n = [], s = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const idx = i * 5 + j;
      const dx = j - 2;
      const dy = i - 2;
      if (dx < 0) w.push(idx);
      if (dx > 0) e.push(idx);
      if (dy < 0) n.push(idx);
      if (dy > 0) s.push(idx);
    }
  }
  return [w, e, n, s];
})();

// Parent g4 lost in season #8 to Membrane_g2_86704b in 158 ticks
// (seed=123) and stalled to max-ticks twice vs Stalker_g1_8767f6
// (seeds 247, 51). The Membrane loss is the structural one worth
// chasing: g4's pre-scan picks the strongest-beatable ADJACENT enemy,
// scored only by the strength on the neighbor tile itself. Against a
// wall bot, the adjacent enemy is a thin facade with heavy backing
// one tile behind. Killing the facade does nothing - the backing
// reflows it and we never break the line.
//
// Fix: extend "biggest threat" from 1-deep to 2-deep. For each
// cardinal neighbor with a beatable enemy, look one further step into
// that hemisphere of the 5x5 and add the enemy mass there to the
// score, weighted at 0.4. Adjacent strength still dominates so we
// don't redirect to soft targets, but ties and near-ties now go to
// the side where the enemy has actual depth - which is exactly the
// side worth puncturing first vs Membrane.
//
// Margin and tech unchanged; this is a target-selection refinement,
// not a sizing or commit-strength change. The max-tick Stalker stalls
// are not addressed here - they're a global geometry problem an
// individual army can't fix without a real distant-prey kernel, which
// g3 tried and g4 correctly debunked. Worth a separate descendant.
export default {
  name: "Conqueror_g5_ff0e8a",
  author: "claude",
  version: 1,
  description: "Conqueror_g4 + 2-deep hemisphere-weighted threat scoring on the adjacent kill priority.",
  summary: `Parent Conqueror_g4_1f6790 lost to Membrane_g2_86704b in
158 ticks (seed=123). Reading the matchup: Membrane fronts a thin
facade tile with heavy backing one step behind. g4's pre-scan picks
the strongest beatable ADJACENT enemy by strength-on-the-tile alone,
so it preferentially kills the facade - which Membrane reflows from
the backing, and we never punch through.

This descendant keeps g4's pre-scan structure, minimum-overkill
sizing, MARGIN=0.6, fallback to Conqueror, and tech (90/0/2/4/4)
all unchanged. The only change is the score function for adjacent
candidates: instead of just enemy strength on the neighbor, we add
0.4 * total enemy strength in that direction's hemisphere of the
5x5 stencil. The adjacent value still dominates (weight 1 vs 0.4
spread over up to 10 cells); ties and near-ties go to the side
with more enemy depth.

Why hemisphere not just one tile behind: a wall is wider than one
column. Summing the whole hemisphere captures the structural mass
we're up against, not just one tile's noise. Why 0.4 not 1.0: at
1.0 we'd happily redirect to side-targets with deep but mostly
non-immediate backing; we want to bias selection without changing
which threats are even considered viable.

Does NOT address the max-tick Stalker stalls - those are a global
geometry problem an individual army can't solve. g3 tried a 2-deep
movement fallback there and g4's analysis correctly identified it
as dead code in this kernel. A real distant-prey path-finder is
worth a separate descendant.`,
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
    const stencil = tile.stencil5;
    const viewer = army.player;

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
      const needed = enemy / BONUS + MARGIN;
      if (needed > sLimit) continue;

      let backing = 0;
      if (stencil) {
        const idxs = HEMI[i];
        for (let k = 0; k < idxs.length; k++) {
          const cell = stencil[idxs[k]];
          if (!cell) continue;
          const cArmies = cell.armies;
          if (cArmies.length === 0) continue;
          const e = -sumStrength(cArmies, viewer);
          if (e > 0) backing += e;
        }
      }
      const score = enemy + BACKING_WEIGHT * backing;
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
