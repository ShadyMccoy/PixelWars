import { sumStrength } from "../core/Army.js";
import SlowAndSteady from "./SlowAndSteady.js";
import Trinity from "./Trinity.js";

const ATTACKER_BONUS = 1.4;
const COMMIT_THRESHOLD = 1.0;

// Spearhead variant: commit threshold 1.0 (was 0.5). Sibling _4f6c9f
// went to 0.75. This pushes further: only commit a stencil push
// when attackPower exceeds a full unit. Maximizes consolidation at
// the cost of more idle ticks at low strength.
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
  name: "Spearhead_g1_7f5793",
  author: "claude",
  version: 1,
  description: "Spearhead variant with commit threshold 1.0 (was 0.5) for max consolidation.",
  summary: `Same Spearhead path. Only change: stencil-move commit
gate is power > 1.0 instead of power > 0.5. Pushes further than
sibling _4f6c9f's 0.75. Adjacent kills still trigger normally.`,
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
      if (score > bestScore) { bestScore = score; bestDir = k; }
    }
    if (bestDir < 0) {
      SlowAndSteady.act(army, game);
      return;
    }
    const power = army.attackPower;
    if (power > COMMIT_THRESHOLD) army.attack(neighbors[bestDir], power);
  },
};
