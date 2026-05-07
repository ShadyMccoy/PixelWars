import { sumStrength } from "../core/Army.js";
import SlowAndSteady from "./SlowAndSteady.js";
import Trinity from "./Trinity.js";

const ATTACKER_BONUS = 1.4;
const BACKING_WEIGHT = 0.4;
const KILL_MARGIN = 0.6;

// Spearhead variant: keeps the parent's body-far-behind kernel
// (weight 2 on the two-cells-back-on-axis tile) for the directional
// fallback, but rewires Pass 1 (adjacent kill selection) to match
// what actually beat the parent.
//
// The parent's only loss in season #43 was to Conqueror_g7_31769b.
// That bot's documented edge over its own lineage was Pass 1 target
// scoring: instead of `bestKillStr = enemy` (raw adjacent strength),
// it scores candidates as `enemy + 0.4 * hemisphere_backing`. Against
// wall-like opponents (Conqueror clusters, Membrane facades) the
// loudest adjacent tile is often a thin facade with the real mass
// one step behind it; raw-strength scoring picks the facade and never
// punctures the wall, while hemisphere-weighted scoring biases toward
// the side with structural depth so the kill actually opens a lane.
//
// The parent's Pass 1 has the same defect g7 fixed in the Conqueror
// lineage. Fixing it here is the natural cross-lineage borrow:
//   - Same hemisphere weighting (0.4) and definition (cells strictly
//     in the chosen hemisphere, excluding the orthogonal axis) as g7.
//   - Commit only `enemy/BONUS + 0.6` instead of dumping full
//     attackPower, so leftover strength stays home to feed the next
//     tick's push - the same sizing g7 uses.
// Pass 2 (the kernel-weighted directional choice) is unchanged from
// the parent: this isolates the change to target selection on the
// step that actually loses or wins the matchup.
function buildKernels() {
  const east = [
    [0, -1, 3], [0, -2, 2],
    [-1, -1, 1], [1, -1, 1],
  ];
  function rotate([dy, dx, w], dir) {
    switch (dir) {
      case 0: return [dy, -dx, w];
      case 1: return [dy, dx, w];
      case 2: return [-dx, dy, w];
      case 3: return [dx, -dy, w];
    }
    return [dy, dx, w];
  }
  return [0, 1, 2, 3].map((dir) => {
    const out = [];
    for (const t of east) {
      const [dy, dx, w] = rotate(t, dir);
      const idx = (dy + 2) * 5 + (dx + 2);
      if (idx < 0 || idx >= 25) continue;
      out.push(idx, w);
    }
    return out;
  });
}

const OFFSETS = buildKernels();

// Per-direction stencil5 indices strictly in that hemisphere; the
// orthogonal axis is excluded so the four hemispheres do not double-
// count cells directly beside us. Mirrors Conqueror_g7_31769b's HEMI.
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

export default {
  name: "Spearhead_g2_344887",
  author: "claude",
  version: 1,
  description: "Spearhead with hemisphere-weighted Pass 1 target selection (cross-borrow from Conqueror_g7).",
  summary: `Parent Spearhead_g1_fbedc2 lost season #43 to
Conqueror_g7_31769b. g7's documented win lever vs its own lineage is
Pass 1 scoring: adjacent kill candidates are scored as
enemy + 0.4 * hemisphere_backing instead of by raw adjacent
strength, so kills are aimed at the side with real depth (a wall)
rather than the loudest single facade tile. The parent's Pass 1 has
the same raw-strength defect g7 already fixed in the Conqueror line.

This descendant ports that single lever into Spearhead. Pass 1 now
picks the beatable adjacent enemy with the highest
enemy + 0.4 * hemisphere_backing, and commits only enemy/BONUS + 0.6
instead of dumping full attackPower - so leftover strength stays
home to feed the next push (the sizing g7 uses). Pass 2 is the
parent's body-far-behind kernel, unchanged: this isolates the change
to target selection on the step that actually loses or wins the
matchup. Tech is unchanged from the parent (peanut-butter 20/20/20
/20/20).`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    const stencil = tile.stencil5;
    const viewer = army.player;

    // Pass 1: best beatable adjacent enemy by hemisphere-weighted score.
    let bestKill = null;
    let bestScore = -1;
    let bestNeeded = 0;
    const neighborInfo = [null, null, null, null];
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
      neighborInfo[i] = { friendly, enemy, empty: armies.length === 0 };
      if (friendly || enemy <= 0) continue;
      const needed = enemy / ATTACKER_BONUS + KILL_MARGIN;
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
        bestNeeded = needed;
        bestKill = t;
      }
    }
    if (bestKill) {
      army.attack(bestKill, bestNeeded);
      return;
    }

    // Pass 2: kernel-weighted directional choice (unchanged from parent).
    if (!stencil) {
      Trinity.act(army, game);
      return;
    }
    const myEff = sLimit * ATTACKER_BONUS;
    let bestDir = -1;
    let bestKernelScore = -Infinity;
    for (let k = 0; k < 4; k++) {
      const target = neighbors[k];
      if (!target) continue;
      const info = neighborInfo[k];
      if (info && !info.friendly && info.enemy > 0 && myEff <= info.enemy) continue;

      const offs = OFFSETS[k];
      let score = 0;
      for (let n = 0; n < offs.length; n += 2) {
        const t = stencil[offs[n]];
        if (!t) continue;
        score += offs[n + 1] * sumStrength(t.armies, viewer);
      }
      if (info) {
        if (info.empty) score += 20;
        else if (info.friendly) score -= 10;
      }
      if (score > bestKernelScore) { bestKernelScore = score; bestDir = k; }
    }
    if (bestDir < 0) {
      SlowAndSteady.act(army, game);
      return;
    }
    if (sLimit > 0.5) army.attack(neighbors[bestDir], sLimit);
  },
};
