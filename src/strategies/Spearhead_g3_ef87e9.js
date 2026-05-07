import { sumStrength } from "../core/Army.js";
import SlowAndSteady from "./SlowAndSteady.js";
import Trinity from "./Trinity.js";

const BASE_BONUS = 1.4;
const KILL_MARGIN = 0.5;
const COMMIT_THRESHOLD = 1.0;
const MIN_REAR_SUPPORT = 1.0;

// Spearhead g3 (parent: Spearhead_g2_1b3e2d). Parent ran neutral
// tech 20/20/20/20/20 and lost three head-to-heads to move-heavy
// Conqueror descendants (Conqueror_g3_4a7a4a, _e8a76e, _g6_936d2f).
// Two structural problems shared across those losses:
//
// 1) Neutral tech means a 1.3 garrison floor. The Conquerors that
//    beat us run move=75-90, so their per-tick throughput is
//    materially higher every tick of the match. Free buff to take.
//
// 2) Parent's kill path does
//        army.attack(bestKill, army.attackPower)
//    i.e. it dumps the entire mobile pool on a kill, even when the
//    enemy was tiny. Conqueror_g3_e8a76e specifically tightened the
//    same path to minimum-overkill sizing
//        needed = enemy / (BONUS * atkMult) + SAFETY
//    leaving the leftover strength on the source tile so the next
//    tick's grow starts from a higher base. Same kill rate, more
//    strength preserved per kill.
//
// Both fixes apply cleanly without touching the kernel push: g2's
// commit threshold (1.0) and rear-support floor (1.0) are kept
// verbatim, and the stencil/Trinity/SlowAndSteady fallbacks are
// unchanged. The kill sizing also becomes tech-aware so this
// descendant correctly uses the new atk multiplier.
//
// Tech: {move:75, stack:0, prod:5, atk:12, def:8}. Garrison drops
// 1.3 -> 0.75 (big), atk-mult 1.0 -> 0.976 (small bump from 12 vs
// neutral 20 baseline; conservative because Spearhead's main edge
// is positional, not raw atk), def-mult 1.0 -> 0.964 (cost we
// accept), prod-mult 1.0 -> 0.988 (small cost). Keeps stack
// neutral so maxStrength is unchanged - Spearhead wants the same
// stencil math the parent used.
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
  name: "Spearhead_g3_ef87e9",
  author: "claude",
  version: 1,
  description: "Spearhead g3: move-heavy tech + minimum-overkill kill sizing.",
  summary: `Two changes vs parent Spearhead_g2_1b3e2d, both lifted
from the Conqueror lineage that beat it (g3_4a7a4a, g3_e8a76e,
g6_936d2f) in season #31:

1. Tech: 20/20/20/20/20 -> 75/0/5/12/8. Garrison floor 1.3 -> 0.75
   (matches the throughput edge that Conqueror_g3 variants run).
   Atk and def shifted modestly off neutral; stack stays at neutral
   so maxStrength is unchanged - Spearhead's stencil scoring is
   built around the unmodified kernel cells.

2. Adjacent-kill sizing: parent did army.attack(bestKill,
   army.attackPower), dumping the full mobile pool. g3 uses
   needed = enemy / (BASE_BONUS * atkMult) + 0.5, floored at 0.55
   to clear the engine's > 0.5 attack-validity gate. Same kill
   rate, but leftover strength stays on the source tile.

g2's two disciplines (commit threshold 1.0, rear-support floor
1.0) are preserved verbatim; the stencil-push / Trinity /
SlowAndSteady fallbacks are byte-identical to the parent. Bet:
parent already had decent positional play (it placed #2/#3
rather than dying in the three losses); fixing the throughput
and overkill leaks closes the gap to the Conquerors that finish
ahead of it.`,
  tech: { move: 75, stack: 0, prod: 5, atk: 12, def: 8 },
  act(army, game) {
    const tile = army.tile;
    if (!tile) return;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    const atkMult = (army.player.techMults && army.player.techMults.atk) || 1;
    const eff = BASE_BONUS * atkMult;
    const myEff = sLimit * eff;

    // Pass 1: strongest beatable adjacent enemy, sized to minimum overkill.
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
      const power = Math.max(bestKillStr / eff + KILL_MARGIN, 0.55);
      army.attack(bestKill, power);
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
