import { sumStrength } from "../core/Army.js";
import SlowAndSteady from "./SlowAndSteady.js";
import Trinity from "./Trinity.js";

const ATTACKER_BONUS = 1.4;

// Direction-specific kernels (East-pattern, rotated). Spearhead
// rewards directions that have FRIENDLIES BEHIND on the chosen axis
// (rear support that will refill our tile) AND empty/enemy-light
// tiles AHEAD (room to expand). It is implemented as a directional
// score combining +friendly-behind and -friendly-ahead.
function buildKernels() {
  // East-facing pattern. Positive weights = "want friendly here".
  const east = [
    [0, -1, 3], [0, -2, 1],     // body BEHIND on axis
    [-1, -1, 1], [1, -1, 1],    // rear flank diagonals
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
  name: "Spearhead",
  author: "shady",
  version: 1,
  description: "Kills adjacent enemies; otherwise picks the direction with the most friendly rear support, preferring empty target tiles.",
  summary: `A Crusader/Trinity hybrid tuned for forward push. Like Crusader,
the first action every tick is to look for an immediately winnable
adjacent enemy (factoring 1.4x attacker bonus) and shove all-in for
the kill. With no kill available, we run a lightweight stencil scan
that scores each direction by REAR friendly support only (body
behind, diagonal rear flanks). Combined with a +20 bonus for an
empty target tile and a -10 penalty for a friendly target tile
(attacks into our own stacks usually waste strength to maxStrength
cap), this picks the direction that turns rear support into new
territory. Targets that are unbeatable enemies trigger
SlowAndSteady fallback so we don't suicide.

Difference from Crusader: Crusader's fallback is Trinity's knight
kernels, which sometimes drag us into friendly stacks. Spearhead's
fallback explicitly prefers expanding into empty land while still
honoring the rear-support gradient.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const myEff = (army.strength - 1) * ATTACKER_BONUS;

    // 1) Kill any winnable adjacent enemy first.
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
      army.attack(bestKill, army.strength - 1);
      return;
    }

    // 2) Pick a direction by rear support + target preference.
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
      // Skip directions where we'd suicide.
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
    const power = army.strength - 1;
    if (power > 0.5) army.attack(neighbors[bestDir], power);
  },
};
