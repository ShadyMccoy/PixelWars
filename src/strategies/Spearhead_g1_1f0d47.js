import { sumStrength } from "../core/Army.js";
import SlowAndSteady from "./SlowAndSteady.js";
import Trinity from "./Trinity.js";

const ATTACKER_BONUS = 1.5;

// Spearhead variant: ATTACKER_BONUS 1.4 -> 1.5. Sibling _859468
// already tried 1.45 successfully (top-5 every season). This pushes
// further: assume the engine's attacker bonus is even more
// favorable than 1.4 implies, since most matches see kills cleanly
// resolved. Larger myEff means more enemies count as "winnable."
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
  name: "Spearhead_g1_1f0d47",
  author: "claude",
  version: 1,
  description: "Spearhead variant with ATTACKER_BONUS 1.5 (was 1.4).",
  summary: `Same Spearhead path. Only change: ATTACKER_BONUS pushed
to 1.5. Sibling _859468 demonstrated 1.45 helped; this tests whether
the curve keeps going. Risk is a lossy kill that didn't pay off; the
existing strict suicide-skip on stencil moves still applies.`,
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
    if (power > 0.5) army.attack(neighbors[bestDir], power);
  },
};
