import { sumStrength } from "../core/Army.js";
import SlowAndSteady from "./SlowAndSteady.js";
import Trinity from "./Trinity.js";

const ATTACKER_BONUS = 1.4;
const COMMIT_THRESHOLD = 1.0;
const MIN_REAR_SUPPORT = 1.0;

// Spearhead g2 (parent: Spearhead_g1_4f6c9f, which raised the
// commit threshold to 1.0 and won S#19). This g2 keeps the
// parent's threshold and adds a second discipline: only commit a
// stencil push when the chosen direction has *real* rear support,
// not just barely-positive kernel score. If the best direction's
// rear-support contribution is below MIN_REAR_SUPPORT (i.e. no
// friendly density behind us), we fall through to SlowAndSteady
// instead of dribbling forward unsupported. Tests whether
// "disciplined commits" stack with "real rear-support."
function buildKernels() {
  const east = [
    [0, -1, 3], [0, -2, 1],
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

export default {
  name: "Spearhead_g2_1b3e2d",
  author: "claude",
  version: 1,
  description: "Spearhead g2: keeps g1_4f6c9f's commit threshold 1.0, adds minimum rear-support floor.",
  summary: `Inherits Spearhead_g1_4f6c9f's commit threshold of 1.0
(skip dribble pushes). Adds a second discipline: track each
direction's rear-support contribution separately, and refuse to
push when the best direction has rear-support below 1.0.
Adjacent kills still take priority. The thesis is that a winning
Spearhead needs both (a) accumulated strength and (b) real rear
backing - either alone produces frail pushes.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const myEff = (army.attackPower) * ATTACKER_BONUS;

    let bestKill = null;
    let bestKillStr = -1;
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
      if (myEff <= enemy) continue;
      if (enemy > bestKillStr) { bestKillStr = enemy; bestKill = t; }
    }
    if (bestKill) {
      army.attack(bestKill, army.attackPower);
      return;
    }

    if (!tile.stencil5) {
      Trinity.act(army, game);
      return;
    }
    const stencil = tile.stencil5;
    const viewer = army.player;
    let bestDir = -1;
    let bestScore = -Infinity;
    let bestRearSupport = 0;
    for (let k = 0; k < 4; k++) {
      const target = neighbors[k];
      if (!target) continue;
      const info = neighborInfo[k];
      if (info && !info.friendly && info.enemy > 0 && myEff <= info.enemy) continue;

      const offs = OFFSETS[k];
      let kernelScore = 0;
      for (let n = 0; n < offs.length; n += 2) {
        const t = stencil[offs[n]];
        if (!t) continue;
        kernelScore += offs[n + 1] * sumStrength(t.armies, viewer);
      }
      let score = kernelScore;
      if (info) {
        if (info.empty) score += 20;
        else if (info.friendly) score -= 10;
      }
      if (score > bestScore) {
        bestScore = score;
        bestDir = k;
        bestRearSupport = kernelScore;
      }
    }
    if (bestDir < 0 || bestRearSupport < MIN_REAR_SUPPORT) {
      SlowAndSteady.act(army, game);
      return;
    }
    const power = army.attackPower;
    if (power > COMMIT_THRESHOLD) army.attack(neighbors[bestDir], power);
  },
};
