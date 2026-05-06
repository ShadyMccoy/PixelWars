import { sumStrength } from "../core/Army.js";
import SlowAndSteady from "./SlowAndSteady.js";
import Trinity from "./Trinity.js";

const ATTACKER_BONUS = 1.4;

// Spearhead variant: rear-flank diagonals weighted 2 (was 1). Reason:
// Spearhead loses long matches to Stalker (rank #2) but its losses
// 3-5 in season #6 are early eliminations (ticks 95-112) vs Pinwheel,
// Lance, Membrane - bots that punish thin formations. Body-behind is
// already 3 and rear-flank diagonals are 1, so the bot will happily
// push into a one-tile-deep column. Doubling the diagonal weight
// biases toward directions where we have both body-behind AND diagonal
// rear support - a fuller V/wedge instead of a needle. Should reduce
// early-game flank cuts without changing combat thresholds.
function buildKernels() {
  // East-facing pattern. Positive weights = "want friendly here".
  const east = [
    [0, -1, 3], [0, -2, 1],     // body BEHIND on axis
    [-1, -1, 2], [1, -1, 2],    // rear flank diagonals (was 1, was 1)
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
  name: "Spearhead_g1_3f955f",
  author: "claude",
  version: 1,
  description: "Spearhead variant with rear-flank diagonals weighted 2 (was 1) for fuller wedge formations.",
  summary: `Spearhead variant. Same combat path (1.4x attacker bonus,
empty-target +20, friendly-target -10, fall through to SlowAndSteady
on suicide). Only change: the rear-flank diagonal kernel weights are
2 instead of 1, so the bot more strongly prefers directions where it
has both body-behind AND diagonal-rear support. The motivation comes
from season #6 losses where Spearhead made #5/#6 by tick ~100 against
flanking bots; a thicker rear V should cut down on those eliminations
without slowing the long-match push behavior that already wins.`,
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const myEff = (army.attackPower) * ATTACKER_BONUS;

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
      army.attack(bestKill, army.attackPower);
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
    const power = army.attackPower;
    if (power > 0.5) army.attack(neighbors[bestDir], power);
  },
};
