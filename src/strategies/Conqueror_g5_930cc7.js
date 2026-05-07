import Conqueror from "./Conqueror.js";

const BONUS = 1.4;
const TERRITORY_BIAS = 0.3;

// Parent g4_1f6790 dominated season #48 with no recorded losses by
// adding a "kill the strongest beatable adjacent enemy first" pass in
// front of Conqueror's alignment kernel. The hole that's still open:
// g4 ranks candidates by raw enemy strength only. A kill into a tile
// with no friendly territory backing routinely gets retaken next
// tick — we burn the reserve, the tile flips back, and the enemy is
// just replaced. Worst case: an enemy infiltrated deep into our
// territory (3-4 of our tiles around it) gets passed over for a
// slightly-larger frontier enemy floating in their territory, and the
// infiltration keeps growing.
//
// Fix: weight the kill priority by the target tile's *territorial
// support* — count adjacent tiles whose ownerId is ours, and add
// TERRITORY_BIAS per friendly neighbor to the candidate score. With
// bias=0.3 the max territory bonus (4 friendlies) is +1.2, so it only
// flips ranking on near-ties — strongest enemy still wins when it's
// the unambiguously biggest threat (preserves the Membrane defense
// thesis), but a deeply-infiltrated 3.0-strength enemy now outranks
// a frontier 3.5-strength enemy floating in enemy territory. That's
// the correct call: the deep-infiltration kill collapses a wound
// inside our position, and the captured tile holds because friendly
// neighbors can reinforce / discourage retake. Tech preserved
// (90/0/2/4/4 — the GA optimum the lineage runs).
export default {
  name: "Conqueror_g5_930cc7",
  author: "claude",
  version: 1,
  description: "g4 with capture-value-weighted kill priority: ties broken toward enemies surrounded by our territory.",
  summary: `Parent g4 prioritized killing the strongest beatable adjacent enemy
before deferring to Conqueror, and dominated season #48 doing so. The
remaining hole: ranking purely by enemy strength means a kill into a
tile with no friendly territory backing (frontier enemy, no support)
beats a kill into a deeply-infiltrated enemy with all-friendly
neighbors — even though the latter capture *holds* and collapses a
wound inside our position. We add a small territory bias (0.3 per
friendly-owned neighbor of the candidate tile, max +1.2) to the kill
score. The bias only flips rankings on near-ties; clear membrane
threats still get killed first (defense thesis intact), but
infiltrators tucked into our territory now outrank slightly-larger
frontier enemies. Captured tiles backed by our ownership are also
likelier to survive the next tick, so the reserve we spend on the
kill isn't wasted. Falls through to Conqueror unchanged when no
beatable adjacent enemy exists. Tech kept at 90/0/2/4/4.`,
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
      let friendlyNbrs = 0;
      const tn = t.neighbors;
      for (let n = 0; n < 4; n++) {
        const nt = tn[n];
        if (nt && nt.ownerId === pid) friendlyNbrs++;
      }
      const score = enemy + TERRITORY_BIAS * friendlyNbrs;
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
