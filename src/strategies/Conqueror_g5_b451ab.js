import { sumStrength } from "../core/Army.js";

const BONUS = 1.4;
// Parent (and Conqueror.act) used a 0.6 margin: needed = enemy/BONUS + 0.6.
// On lab1 (24x18 wrap, growth 1.8, maxArmy 6) the typical enemy stack is
// 1.0-3.5, so the absolute kill cost is enemy/1.4 + slack. With slack 0.6
// you skip every fight where attackPower lands in the band
//   [enemy/1.4 + 0.45, enemy/1.4 + 0.6).
// Tightening to 0.45 picks up that band as actual engagements instead of
// stalls. 0.45 still beats the resolution-order float jitter (sub-0.1) and
// absorbs a small mid-tick reinforcement; only a coordinated pile-on of
// ~0.6+ strength flips the kill, which is rare on this map.
//
// A second-order benefit: every successful kill also leaves 0.15 more
// strength on the home tile (we send less surplus). Across a 6000-tick
// match that compounds — Conqueror's whole identity is "don't waste
// strength", and the 0.6 margin was leaving 0.15 of it on the floor on
// every kill.
const MARGIN = 0.45;

// Trinity-style alignment kernels (copied from Conqueror.js so we can
// drive commitment with our own MARGIN without a second BONUS in scope).
const KERNELS = [
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
];

const OFFSETS = KERNELS.map((k) => {
  const out = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const w = k[i][j];
      if (w !== 0) out.push(i * 5 + j, w);
    }
  }
  return out;
});

export default {
  name: "Conqueror_g5_b451ab",
  author: "claude",
  version: 1,
  description: "Conqueror with tightened kill margin (0.45) and the dead 5x5 fallback removed.",
  summary: `Two changes from Conqueror_g4_868391:

1. Removed the 5x5 stencil fallback. The parent only invoked it when
   hasAdjacentTarget was false, and that condition is exactly the
   condition under which tryCommit also fails on every neighbor (same
   beatability gate, same friendly-room check). On lab1 (wrap, all 4
   neighbors always exist) the fallback was effectively dead code: it
   computed a target it could not commit toward. Removing it shrinks
   the bot to its actually-load-bearing logic.

2. Tightened the kill margin from 0.6 to 0.45 in the inlined Conqueror
   loop. The parent skipped every enemy where attackPower fell in the
   band [enemy/1.4 + 0.45, enemy/1.4 + 0.6); those are now wins. The
   slimmer margin also leaves 0.15 more strength behind on every kill,
   which is exactly the kind of compounding waste Conqueror was
   designed to fix in the first place. 0.45 still absorbs float jitter
   and a small mid-tick reinforcement; only a 0.6+ pile-on flips the
   kill, which is rare in practice on a 24x18 wrap map with maxArmy 6.

Tech is identical to the parent (move-heavy blitz). Trinity kernels,
balance-toward-parity for friendlies, max-commit on empty tiles —
all unchanged. Just the margin and the dead fallback.`,
  tech: { move: 90, stack: 0, prod: 2, atk: 4, def: 4 },
  act(army) {
    const tile = army.tile;
    if (!tile || !tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    const ranked = [];
    for (let k = 0; k < 4; k++) {
      if (!neighbors[k]) continue;
      const offs = OFFSETS[k];
      let score = 0;
      for (let n = 0; n < offs.length; n += 2) {
        const t = stencil[offs[n]];
        if (!t) continue;
        score += offs[n + 1] * sumStrength(t.armies, viewer);
      }
      ranked.push([score, k]);
    }
    ranked.sort((a, b) => b[0] - a[0]);

    for (let r = 0; r < ranked.length; r++) {
      const dir = ranked[r][1];
      const target = neighbors[dir];
      const armies = target.armies;

      let friendlyArmy = null;
      let enemy = 0;
      for (let i = 0; i < armies.length; i++) {
        const a = armies[i];
        if (a.player.id === pid) friendlyArmy = a;
        else enemy += a.strength;
      }

      if (friendlyArmy) {
        const cap = friendlyArmy.maxStrength;
        if (friendlyArmy.strength >= cap - 0.5) continue;
        const room = cap - friendlyArmy.strength;
        const want = (army.strength - friendlyArmy.strength) / 2;
        const power = Math.min(sLimit, room, Math.max(0.6, want));
        if (power > 0.5) {
          army.attack(target, power);
          return;
        }
        continue;
      }

      if (enemy > 0) {
        const needed = enemy / BONUS + MARGIN;
        if (needed > sLimit) continue;
        army.attack(target, needed);
        return;
      }

      army.attack(target, sLimit);
      return;
    }
  },
};
