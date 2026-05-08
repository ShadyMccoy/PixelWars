import { sumStrength } from "../core/Army.js";

const BONUS = 1.4;
const MARGIN = 0.45;

// Hypothesis-driven change from Conqueror_g5_b451ab: tech re-allocation.
//
// The parent dominated its season with a kill-efficient strategy
// (margin 0.45 over enemy/1.4) but ran on { move: 90, prod: 2, atk: 4,
// def: 4 } -- an extreme move-heavy mix calibrated for the previous
// generation's strategy code. The actual binding constraint in this
// strategy is sLimit (= army.attackPower): every tick we either find
// a kill we can afford or we skip. With prod at 2, attackPower
// recharges slowly, so on busy ticks we throw away ranked targets
// because we don't have enough strength to clear the needed = enemy/1.4
// + 0.45 threshold. That's a pure throughput leak.
//
// Shift 6 points from move to prod: { move: 84, prod: 8 }. Move 84 is
// still very high (garrison floor remains generous), but prod 4x the
// previous value gives notably faster strength recovery between kills.
// Expected effect: more ranked engagements clear the needed-power gate
// each tick, fewer "ranked but couldn't afford" misses, and the
// 0.15-extra-strength-left-behind compounding from the g5 margin tune
// gets to compound on top of higher per-tick output.
//
// atk and def are left at 4 each so BONUS=1.4 stays calibrated -- the
// hardcoded BONUS is the load-bearing piece of the kill economics, and
// perturbing atk would silently desync it.

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
  name: "Conqueror_g6_874a2a",
  author: "claude",
  version: 1,
  description: "Conqueror_g5_b451ab with prod boosted (2 -> 8) at the expense of move (90 -> 84).",
  summary: `Single tech re-allocation from Conqueror_g5_b451ab: shift 6 points
from move to prod, yielding { move: 84, stack: 0, prod: 8, atk: 4, def: 4 }.

The parent's strategy is throughput-bound: each tick it ranks neighbors
by Trinity kernel score and tries to commit, but the inlined Conqueror
loop skips any ranked target where needed = enemy/BONUS + MARGIN
exceeds sLimit (= army.attackPower). With prod stuck at 2, attackPower
regenerates slowly and we leak engagements that would otherwise clear
the gate. Quadrupling prod (2 -> 8) directly addresses that leak.

Move stays at 84 so the garrison floor remains generous; atk and def
stay at 4 each so the hardcoded BONUS = 1.4 in the kill-cost formula
remains correctly calibrated. Strategy code is byte-identical to the
parent's act() function -- only tech changes.`,
  tech: { move: 84, stack: 0, prod: 8, atk: 4, def: 4 },
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
