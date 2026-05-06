import { sumStrength, totalStrength } from "../core/Army.js";

const BONUS = 1.4;

// Trinity's three-in-a-row kernels — alignment is the same idea, but
// commitment is smarter (per-target sizing, not blanket strength-1).
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
  name: "Conqueror",
  author: "claude",
  version: 1,
  description: "Trinity alignment with target-aware commitment (no waste on full friendlies or soft enemies).",
  summary: `Trinity wins the meta because three-in-a-row alignment compounds —
but Trinity dumps strength-1 every tick into whichever direction wins the
convolution, even if that tile is already a maxed-out friendly (waste) or
a 0.5-strength enemy (massive overkill). Conqueror keeps the alignment
score — same kernels — but sizes the commitment to the target:
  - friendly target: send only enough to bring it toward parity (balanced)
  - empty target: send strength-1 (maximize the new tile)
  - beatable enemy: send enemy/1.4 + small margin (uses 1.4x attacker bonus)
  - unbeatable enemy: skip and pick the next-best aligned direction
This recovers the strength Trinity wastes capping-out friendly tiles, which
compounds across the match. Same emergent flocking, fewer leaks.`,
  act(army) {
    const tile = army.tile;
    if (!tile || !tile.stencil5) return;
    const stencil = tile.stencil5;
    const viewer = army.player;
    const neighbors = tile.neighbors;
    const pid = army.player.id;
    const sLimit = army.attackPower;
    if (sLimit <= 0.5) return;

    // Sort directions by alignment score, then walk that order looking for
    // a viable target. This lets a "second-best" direction win when the
    // top one is blocked by a maxed friendly or an unbeatable enemy.
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

      // Friendly tile: balance toward parity, but skip if it's near-cap.
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

      // Enemy tile: minimum-kill via attacker bonus.
      if (enemy > 0) {
        const needed = enemy / BONUS + 0.6;
        if (needed > sLimit) continue;
        army.attack(target, needed);
        return;
      }

      // Empty tile: take it with what we've got.
      army.attack(target, sLimit);
      return;
    }
  },
};
